/**
 * AES-256-GCM over `node:crypto`. No dependency, same reasoning as `sigv4.ts` and `webpush.ts`:
 * a few lines of stdlib beat a package, **as long as something else checks the answer** — which is
 * what `check-cifrado.ts` does.
 *
 * What this is for: the PAC's credentials live in the database so they can be changed from a
 * screen without a redeploy, and a secret sitting in a column is a secret that leaves with any
 * backup, any dump, any read-only integrator. The key to decrypt them does NOT live in the
 * database; it lives in `AJUSTES_SECRET_KEY`. Stealing the data is then not enough.
 *
 * Pure: no `$env`, no database, no fetch — so it runs under tsx.
 *
 * GCM and not CBC: it authenticates as well as encrypts, so a ciphertext somebody tampered with
 * fails to decrypt instead of decrypting into something else.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITMO = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits: what GCM is specified for. Longer is not safer here, it is slower.
const TAG_BYTES = 16;
export const LLAVE_BYTES = 32;

/** Marks a stored value as ours, so a plaintext left over from before is never fed to the cipher. */
const PREFIJO = "v1:";

/**
 * Read the key from its hex or base64 representation.
 *
 * Refuses anything that is not exactly 32 bytes rather than hashing or padding it into shape:
 * silently accepting a short key would produce something that encrypts and decrypts fine while
 * being trivially weaker than it looks.
 */
export function leerLlave(valor: string | undefined | null): Buffer {
	if (!valor) throw new Error("AJUSTES_SECRET_KEY no está definida");
	const limpio = valor.trim();
	const buf = /^[0-9a-fA-F]{64}$/.test(limpio) ? Buffer.from(limpio, "hex") : Buffer.from(limpio, "base64");
	if (buf.length !== LLAVE_BYTES) {
		throw new Error(`AJUSTES_SECRET_KEY debe ser de ${LLAVE_BYTES} bytes (64 hex o 44 base64)`);
	}
	return buf;
}

/** A fresh key, for `npm run llave`. */
export const generarLlave = (): string => randomBytes(LLAVE_BYTES).toString("hex");

/**
 * `v1:<base64(iv | tag | ciphertext)>`.
 *
 * The IV is fresh on every call — reusing one under the same key is the single way to break GCM
 * outright, so it is generated here rather than being a parameter anybody could pin.
 */
export function cifrar(texto: string, llave: Buffer): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITMO, llave, iv);
	const datos = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
	return PREFIJO + Buffer.concat([iv, cipher.getAuthTag(), datos]).toString("base64");
}

/** Throws on a wrong key or a tampered ciphertext — never returns garbage. */
export function descifrar(guardado: string, llave: Buffer): string {
	if (!guardado.startsWith(PREFIJO)) throw new Error("Valor cifrado con un formato desconocido");
	const bruto = Buffer.from(guardado.slice(PREFIJO.length), "base64");
	if (bruto.length < IV_BYTES + TAG_BYTES) throw new Error("Valor cifrado incompleto");

	const iv = bruto.subarray(0, IV_BYTES);
	const tag = bruto.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
	const datos = bruto.subarray(IV_BYTES + TAG_BYTES);

	const decipher = createDecipheriv(ALGORITMO, llave, iv);
	decipher.setAuthTag(tag);
	// `final()` is what verifies the tag: it throws for a wrong key or a modified ciphertext.
	return Buffer.concat([decipher.update(datos), decipher.final()]).toString("utf8");
}

export const estaCifrado = (valor: string | null | undefined): boolean => (valor ?? "").startsWith(PREFIJO);

/**
 * Constant-time string comparison, for anywhere a secret is compared against caller input.
 *
 * `===` on strings short-circuits at the first differing byte, which leaks how much of a guess was
 * right. Nothing uses this yet; it lives here so that when something does, it does not get written
 * as `===` by whoever needs it at the time.
 */
export function igualSeguro(a: string, b: string): boolean {
	const x = Buffer.from(a, "utf8");
	const y = Buffer.from(b, "utf8");
	// Length is not secret and timingSafeEqual throws on a mismatch, so it is compared first.
	return x.length === y.length && timingSafeEqual(x, y);
}
