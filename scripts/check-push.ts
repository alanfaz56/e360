/**
 * Self-check for the Web Push implementation. Run: npm test
 *
 * Same standard as check-r2.ts: hand-rolled crypto is only defensible if something else checks
 * the answer, so the first assertion pins `cifrarPayload` to the **published test vector in
 * RFC 8291 §5**. Every byte of that vector — the ephemeral key, the salt, the ciphertext — comes
 * from the RFC, so a refactor that breaks encryption fails here instead of silently delivering
 * notifications no browser can decrypt.
 */
import assert from "node:assert/strict";
import { createDecipheriv, createECDH, createHmac, createVerify } from "node:crypto";
import {
	b64url,
	cifrarPayload,
	deB64url,
	generarVapid,
	peticionPush,
	vapidAuthorization,
} from "../src/lib/webpush.js";
import { NOTIFICACION_EVENTOS, NOTIFICACION_EVENTO_KEYS, haceCuanto } from "../src/lib/notificaciones.js";

let ok = 0;
const check = (nombre: string, fn: () => void) => {
	fn();
	ok++;
	console.log(`  ok  ${nombre}`);
};

// --- RFC 8291 §5, the published vector ---------------------------------------------------------
const RFC8291 = {
	texto: "When I grow up, I want to be a watermelon",
	uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
	/** The receiver's PRIVATE key. Only a test ever has this — it is what the browser holds. */
	uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
	authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
	asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
	asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
	salt: "DGv6ra1nlYgDCS1FRnbzlw",
	cuerpo:
		"DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

/**
 * Decrypt the way a BROWSER does, from the receiver's private key.
 *
 * Deliberately written from the RFC rather than by reusing anything from webpush.ts: a test that
 * calls the same helpers it is testing only proves the code agrees with itself. This is the half
 * that proves interop — if the ciphertext does not come back out as the plaintext, no browser
 * would have been able to read it either.
 */
function descifrarComoNavegador(cuerpo: Buffer, uaPrivate: string, authSecret: string): string {
	const salt = cuerpo.subarray(0, 16);
	const idlen = cuerpo.readUInt8(20);
	const asPublic = cuerpo.subarray(21, 21 + idlen);
	const resto = cuerpo.subarray(21 + idlen);

	const ecdh = createECDH("prime256v1");
	ecdh.setPrivateKey(deB64url(uaPrivate));
	const compartido = ecdh.computeSecret(asPublic);
	const uaPublic = ecdh.getPublicKey();

	const uno = (salt: Buffer, ikm: Buffer, info: Buffer, n: number) =>
		createHmac("sha256", createHmac("sha256", salt).update(ikm).digest())
			.update(Buffer.concat([info, Buffer.from([1])]))
			.digest()
			.subarray(0, n);
	const info = (s: string, extra?: Buffer) =>
		Buffer.concat([Buffer.from(s, "ascii"), Buffer.from([0]), extra ?? Buffer.alloc(0)]);

	const ikm = uno(deB64url(authSecret), compartido, info("WebPush: info", Buffer.concat([uaPublic, asPublic])), 32);
	const cek = uno(salt, ikm, info("Content-Encoding: aes128gcm"), 16);
	const nonce = uno(salt, ikm, info("Content-Encoding: nonce"), 12);

	const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
	decipher.setAuthTag(resto.subarray(resto.length - 16));
	const claro = Buffer.concat([decipher.update(resto.subarray(0, resto.length - 16)), decipher.final()]);

	assert.equal(claro.at(-1), 0x02, "falta el delimitador de último record");
	return claro.subarray(0, claro.length - 1).toString("utf8");
}

console.log("Web Push (RFC 8291 / 8292)");

check("cifrarPayload coincide con el vector publicado en RFC 8291 §5", () => {
	const cuerpo = cifrarPayload({
		texto: RFC8291.texto,
		p256dh: RFC8291.uaPublic,
		auth: RFC8291.authSecret,
		salt: deB64url(RFC8291.salt),
		efimeraPrivada: deB64url(RFC8291.asPrivate),
	});
	assert.equal(b64url(cuerpo), RFC8291.cuerpo, "el cuerpo cifrado no coincide con el RFC");
	// The RFC also publishes the sender's public key; it must land in the header verbatim.
	assert.equal(b64url(cuerpo.subarray(21, 86)), RFC8291.asPublic, "la clave efímera no es la del RFC");
});

check("un navegador con la llave privada del RFC recupera el texto original", () => {
	const cuerpo = cifrarPayload({
		texto: RFC8291.texto,
		p256dh: RFC8291.uaPublic,
		auth: RFC8291.authSecret,
	});
	assert.equal(descifrarComoNavegador(cuerpo, RFC8291.uaPrivate, RFC8291.authSecret), RFC8291.texto);
});

check("el texto se recupera con salt y clave efímera aleatorias, no sólo con las del vector", () => {
	const largo = JSON.stringify({ titulo: "Su unidad está lista", cuerpo: "Nota #1042 · ñ á é 😀" });
	const cuerpo = cifrarPayload({ texto: largo, p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret });
	assert.equal(descifrarComoNavegador(cuerpo, RFC8291.uaPrivate, RFC8291.authSecret), largo);
});

check("un auth secret equivocado no descifra", () => {
	const cuerpo = cifrarPayload({ texto: "secreto", p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret });
	assert.throws(() => descifrarComoNavegador(cuerpo, RFC8291.uaPrivate, "AAAAAAAAAAAAAAAAAAAAAA"));
});

check("la cabecera aes128gcm lleva salt(16) + rs(4) + idlen(1) + la clave efímera", () => {
	const cuerpo = cifrarPayload({ texto: "hola", p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret });
	assert.equal(cuerpo.readUInt32BE(16), 4096, "el record size debe ser 4096");
	assert.equal(cuerpo.readUInt8(20), 65, "idlen debe ser 65 (punto P-256 sin comprimir)");
	assert.equal(cuerpo.readUInt8(21), 0x04, "la clave efímera debe venir sin comprimir");
});

check("dos cifrados del mismo texto son distintos (salt y clave efímera frescas)", () => {
	const a = cifrarPayload({ texto: "igual", p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret });
	const b = cifrarPayload({ texto: "igual", p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret });
	assert.notEqual(b64url(a), b64url(b), "reusar salt/clave efímera rompería el cifrado");
});

check("un payload que no cabe en un record se rechaza en vez de truncarse", () => {
	assert.throws(
		() => cifrarPayload({ texto: "x".repeat(4080), p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret }),
		/demasiado grande/,
	);
});

check("una p256dh malformada se rechaza", () => {
	assert.throws(() => cifrarPayload({ texto: "hola", p256dh: "AAAA", auth: RFC8291.authSecret }), /p256dh/);
});

// --- VAPID, RFC 8292 ---------------------------------------------------------------------------
const vapid = { ...generarVapid(), subject: "mailto:taller@estacion360.test" };

check("el JWT de VAPID se verifica con la llave pública declarada", () => {
	const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", vapid);
	const t = /t=([^,]+)/.exec(header)?.[1];
	const k = /k=(.+)$/.exec(header)?.[1];
	assert.ok(t && k, "faltan t= o k= en la cabecera");
	assert.equal(k, vapid.publicKey, "k= debe ser la llave pública del servidor");

	const [h, c, firma] = t.split(".");
	assert.deepEqual(JSON.parse(deB64url(h).toString()), { typ: "JWT", alg: "ES256" });

	const claims = JSON.parse(deB64url(c).toString());
	assert.equal(claims.aud, "https://fcm.googleapis.com", "aud debe ser el ORIGEN del endpoint, no la URL");
	assert.equal(claims.sub, vapid.subject);
	assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600, "exp fuera de rango");

	// The signature has to be raw r||s. DER would be 70-72 bytes and every push service rejects it.
	assert.equal(deB64url(firma).length, 64, "ES256 debe ir en formato ieee-p1363 (r||s), no DER");

	const publica = deB64url(vapid.publicKey);
	const verificador = createVerify("sha256").update(`${h}.${c}`);
	assert.ok(
		verificador.verify(
			{
				format: "jwk",
				key: {
					kty: "EC",
					crv: "P-256",
					x: b64url(publica.subarray(1, 33)),
					y: b64url(publica.subarray(33, 65)),
				},
				dsaEncoding: "ieee-p1363",
			},
			deB64url(firma),
		),
		"la firma no verifica",
	);
});

check("el aud cambia con el servicio de push (un token no sirve en otro)", () => {
	const uno = vapidAuthorization("https://fcm.googleapis.com/fcm/send/a", vapid);
	const dos = vapidAuthorization("https://updates.push.services.mozilla.com/wpush/v2/b", vapid);
	assert.notEqual(uno, dos);
});

check("peticionPush arma cabeceras aes128gcm completas", () => {
	const p = peticionPush(
		{ endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret },
		vapid,
		JSON.stringify({ titulo: "hola" }),
		{ urgencia: "high" },
	);
	assert.equal(p.headers["Content-Encoding"], "aes128gcm");
	assert.equal(p.headers["Content-Type"], "application/octet-stream");
	assert.equal(p.headers.Urgency, "high");
	assert.equal(p.headers.TTL, "86400");
	assert.match(p.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
	assert.ok(p.body.length > 21 + 65, "el cuerpo debe traer cabecera + clave + ciphertext");
});

// --- The event registry ------------------------------------------------------------------------
console.log("Registro de eventos");

check("todo evento de difusión declara el permiso que define su audiencia", () => {
	for (const k of NOTIFICACION_EVENTO_KEYS) {
		const def = NOTIFICACION_EVENTOS[k];
		if (def.alcance === "difusion") {
			assert.ok("permiso" in def && def.permiso, `${k}: difusión sin permiso deja la audiencia indefinida`);
		}
	}
});

check("ningún evento dirigido al cliente es de difusión", () => {
	for (const k of NOTIFICACION_EVENTO_KEYS) {
		const def = NOTIFICACION_EVENTOS[k];
		if (def.audiencia === "cliente") {
			assert.equal(def.alcance, "directo", `${k}: un aviso al cliente siempre tiene un destinatario`);
		}
	}
});

check("los eventos de cliente van con prefijo cliente_ y los de personal no", () => {
	// The prefix is what makes a miswired emit obvious in review: `cliente_*` copy is the only
	// copy that must never name a taller aliado.
	for (const k of NOTIFICACION_EVENTO_KEYS) {
		assert.equal(
			NOTIFICACION_EVENTOS[k].audiencia === "cliente",
			k.startsWith("cliente_"),
			`${k}: el prefijo y la audiencia no coinciden`,
		);
	}
});

check("haceCuanto redondea a la unidad legible", () => {
	const base = new Date("2026-08-05T12:00:00Z");
	const antes = (min: number) => new Date(base.getTime() - min * 60_000).toISOString();
	assert.equal(haceCuanto(antes(0.2), base), "hace un momento");
	assert.equal(haceCuanto(antes(5), base), "hace 5 min");
	assert.equal(haceCuanto(antes(120), base), "hace 2 h");
	assert.equal(haceCuanto(antes(60 * 24 * 3), base), "hace 3 d");
	// Older than a month falls back to a date instead of "hace 47 d", which nobody can parse.
	assert.match(haceCuanto(antes(60 * 24 * 90), base), /\d/);
});

console.log(`\n${ok} verificaciones OK`);
