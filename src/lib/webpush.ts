/**
 * Web Push: message encryption (RFC 8291) and VAPID (RFC 8292).
 *
 * Hand-rolled on `node:crypto`, no SDK, for the same reason `sigv4.ts` is — Rule 7 says no new
 * runtime dependency for something the platform already covers, and Node ships every primitive
 * this needs (ECDH P-256, HMAC-SHA256, AES-128-GCM, ES256).
 *
 * Hand-rolled crypto is only defensible when something else checks the answer, so
 * `scripts/check-push.ts` pins `cifrarPayload` to **the published test vector in RFC 8291 §5**
 * and the VAPID JWT to a round-trip verify. If either drifts, `npm test` fails.
 *
 * Deliberately pure: no `$env`, no database, no fetch. Everything that touches the outside world
 * lives in `src/lib/server/push.ts`, which is what makes this file runnable under tsx.
 */

import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "node:crypto";

const CURVA = "prime256v1";
/** Record size. One record is enough: no push service accepts more than ~4 KB anyway. */
const RS = 4096;
/** AES-GCM tag (16) + the 0x02 padding delimiter (1). */
const SOBRECARGA = 17;

export const b64url = (b: Uint8Array): string => Buffer.from(b).toString("base64url");
export const deB64url = (s: string): Buffer => Buffer.from(s, "base64url");

/**
 * HKDF-SHA256 restricted to one output block.
 *
 * Every derivation Web Push needs is 32 bytes or less, so the counter never leaves 0x01 and the
 * expand loop collapses to a single HMAC. `crypto.hkdfSync` would do the same thing with an
 * extra Buffer copy and a wider surface to get wrong.
 */
function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, largo: number): Buffer {
	if (largo > 32) throw new Error("hkdf: esta implementación entrega máximo 32 bytes");
	const prk = createHmac("sha256", salt).update(ikm).digest();
	return createHmac("sha256", prk)
		.update(Buffer.concat([info, Buffer.from([1])]))
		.digest()
		.subarray(0, largo);
}

const info = (etiqueta: string, extra?: Uint8Array) =>
	Buffer.concat([Buffer.from(etiqueta, "ascii"), Buffer.from([0]), extra ?? Buffer.alloc(0)]);

export type Suscripcion = {
	endpoint: string;
	/** The UA public key, base64url, exactly as `PushSubscription.getKey('p256dh')` gives it. */
	p256dh: string;
	/** The UA auth secret, base64url, from `getKey('auth')`. */
	auth: string;
};

/**
 * Encrypt a push payload with `aes128gcm` (RFC 8291).
 *
 * `salt` and `efimeraPrivada` exist only so the test can pin this to the RFC's vector — in
 * production both are freshly random on every single message, which is what makes the scheme
 * safe. Never pass them from a caller that is not a test.
 */
export function cifrarPayload(input: {
	texto: string;
	p256dh: string;
	auth: string;
	salt?: Uint8Array;
	efimeraPrivada?: Uint8Array;
}): Buffer {
	const uaPublic = deB64url(input.p256dh);
	const authSecret = deB64url(input.auth);
	if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
		throw new Error("p256dh inválida: se espera un punto P-256 sin comprimir de 65 bytes");
	}

	const ecdh = createECDH(CURVA);
	if (input.efimeraPrivada) ecdh.setPrivateKey(Buffer.from(input.efimeraPrivada));
	else ecdh.generateKeys();
	const asPublic = ecdh.getPublicKey();
	const compartido = ecdh.computeSecret(uaPublic);

	// RFC 8291 §3.4. The key_info binds the derived key to BOTH public keys, which is what stops
	// a shared secret from one subscription being replayed against another.
	const ikm = hkdf(authSecret, compartido, info("WebPush: info", Buffer.concat([uaPublic, asPublic])), 32);

	const salt = input.salt ? Buffer.from(input.salt) : randomBytes(16);
	const cek = hkdf(salt, ikm, info("Content-Encoding: aes128gcm"), 16);
	const nonce = hkdf(salt, ikm, info("Content-Encoding: nonce"), 12);

	const texto = Buffer.from(input.texto, "utf8");
	if (texto.length + SOBRECARGA > RS) {
		throw new Error(`Payload demasiado grande: ${texto.length} bytes, el máximo es ${RS - SOBRECARGA}`);
	}

	const cipher = createCipheriv("aes-128-gcm", cek, nonce);
	// 0x02 is the delimiter for the LAST record. 0x01 would promise another record follows.
	const cifrado = Buffer.concat([cipher.update(Buffer.concat([texto, Buffer.from([2])])), cipher.final()]);

	// aes128gcm header: salt(16) || rs(4, big-endian) || idlen(1) || keyid(idlen)
	const cabecera = Buffer.alloc(21);
	salt.copy(cabecera, 0);
	cabecera.writeUInt32BE(RS, 16);
	cabecera.writeUInt8(asPublic.length, 20);

	return Buffer.concat([cabecera, asPublic, cifrado, cipher.getAuthTag()]);
}

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

/**
 * The `Authorization: vapid t=…, k=…` header (RFC 8292).
 *
 * The JWT proves to the push service that this application server is the one the subscription
 * was issued to; it says nothing about the user and carries no payload data.
 */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, ahora = Date.now()): string {
	const publica = deB64url(keys.publicKey);
	if (publica.length !== 65 || publica[0] !== 0x04) {
		throw new Error("VAPID_PUBLIC_KEY inválida: se espera un punto P-256 sin comprimir de 65 bytes");
	}

	const llave = createPrivateKey({
		format: "jwk",
		key: {
			kty: "EC",
			crv: "P-256",
			d: keys.privateKey,
			x: b64url(publica.subarray(1, 33)),
			y: b64url(publica.subarray(33, 65)),
		},
	});

	const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
	const claims = b64url(
		Buffer.from(
			JSON.stringify({
				aud: new URL(endpoint).origin,
				// 12 h. The spec caps it at 24; short enough that a leaked token is not a standing key.
				exp: Math.floor(ahora / 1000) + 12 * 60 * 60,
				sub: keys.subject,
			}),
		),
	);

	const firmado = `${header}.${claims}`;
	// ES256 wants the raw r||s pair. Node defaults to DER, which every push service rejects.
	const firma = sign("sha256", Buffer.from(firmado, "ascii"), { key: llave, dsaEncoding: "ieee-p1363" });

	return `vapid t=${firmado}.${b64url(firma)}, k=${keys.publicKey}`;
}

/** Headers and body for the POST to the push service. */
export function peticionPush(
	sub: Suscripcion,
	keys: VapidKeys,
	texto: string,
	opciones: { ttl?: number; urgencia?: "very-low" | "low" | "normal" | "high" } = {},
): { url: string; headers: Record<string, string>; body: Buffer } {
	const body = cifrarPayload({ texto, p256dh: sub.p256dh, auth: sub.auth });
	return {
		url: sub.endpoint,
		headers: {
			Authorization: vapidAuthorization(sub.endpoint, keys),
			"Content-Encoding": "aes128gcm",
			"Content-Type": "application/octet-stream",
			// How long the service holds it for a device that is offline. A day: a "your truck is
			// ready" that arrives three days late is worse than one that never arrives.
			TTL: String(opciones.ttl ?? 86400),
			Urgency: opciones.urgencia ?? "normal",
		},
		body,
	};
}

/** Generate a VAPID keypair. Used by `npm run vapid`, never at runtime. */
export function generarVapid(): { publicKey: string; privateKey: string } {
	const ecdh = createECDH(CURVA);
	ecdh.generateKeys();
	return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(ecdh.getPrivateKey()) };
}
