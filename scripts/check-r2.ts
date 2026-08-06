/**
 * Self-check for the AWS Signature V4 implementation behind R2 uploads. Run: npm test
 *
 * Hand-rolled crypto is only defensible if something else checks the answer, so the first
 * assertion pins it to AWS's OWN published presigned-URL example from "Authenticating Requests:
 * Using Query Parameters (AWS Signature Version 4)". If a refactor breaks the signature this
 * fails here, instead of R2 returning 403 in production for reasons nobody can see.
 */
import assert from "node:assert/strict";
import { encodeRfc3986, firmaDerivada, firmarUrl, marcasDeTiempo } from "../src/lib/sigv4.js";

const EJEMPLO = {
	host: "examplebucket.s3.amazonaws.com",
	ruta: "/test.txt",
	accessKeyId: "AKIAIOSFODNN7EXAMPLE",
	secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
	region: "us-east-1",
	service: "s3",
	expiraSegundos: 86400,
	now: new Date("2013-05-24T00:00:00Z"),
};

// --- The published example --------------------------------------------------------------------
const url = firmarUrl({ metodo: "GET", ...EJEMPLO });
assert.equal(
	new URL(url).searchParams.get("X-Amz-Signature"),
	"aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
	"SigV4 no coincide con el vector publicado por AWS",
);

// --- The URL it builds -------------------------------------------------------------------------
{
	const u = new URL(url);
	assert.equal(u.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
	assert.equal(u.searchParams.get("X-Amz-SignedHeaders"), "host");
	assert.equal(u.searchParams.get("X-Amz-Expires"), "86400");
	assert.equal(u.searchParams.get("X-Amz-Date"), "20130524T000000Z");
	assert.equal(
		u.searchParams.get("X-Amz-Credential"),
		"AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
	);
	assert.equal(u.pathname, "/test.txt");
	// The signature must be last and appear exactly once, or a proxy re-ordering params breaks it.
	assert.equal((url.match(/X-Amz-Signature=/g) ?? []).length, 1);
}

// --- The signature must actually depend on the request -----------------------------------------
// If any of these stopped mattering, the signing would be decorative.
{
	const sig = (extra: Record<string, unknown>) =>
		new URL(firmarUrl({ metodo: "GET", ...EJEMPLO, ...extra } as Parameters<typeof firmarUrl>[0]))
			.searchParams.get("X-Amz-Signature");

	const original = sig({});
	assert.equal(sig({}), original, "firmar debe ser determinista");
	for (const [campo, cambio] of [
		["método", { metodo: "PUT" }],
		["ruta", { ruta: "/otro.txt" }],
		["expiración", { expiraSegundos: 60 }],
		["host", { host: "otro.s3.amazonaws.com" }],
		["fecha", { now: new Date("2013-05-25T00:00:00Z") }],
		["región", { region: "auto" }],
		["llave secreta", { secretAccessKey: "otra-llave-secreta-diferente" }],
		["access key id", { accessKeyId: "AKIAOTRAAAAAAAAAAAAA" }],
	] as const) {
		assert.notEqual(sig(cambio), original, `${campo} debe formar parte de la firma`);
	}
}

// --- The derived signing key -------------------------------------------------------------------
{
	const llave = firmaDerivada(EJEMPLO.secretAccessKey, "20130524", "us-east-1", "s3");
	assert.equal(llave.length, 32, "HMAC-SHA256 siempre da 32 bytes");
	// Each stage of the chain must contribute, or the scope is not really scoping anything.
	const otraFecha = firmaDerivada(EJEMPLO.secretAccessKey, "20130525", "us-east-1", "s3");
	const otraRegion = firmaDerivada(EJEMPLO.secretAccessKey, "20130524", "auto", "s3");
	const otroServicio = firmaDerivada(EJEMPLO.secretAccessKey, "20130524", "us-east-1", "sts");
	assert.notDeepEqual(llave, otraFecha);
	assert.notDeepEqual(llave, otraRegion);
	assert.notDeepEqual(llave, otroServicio);
}

// --- Timestamps --------------------------------------------------------------------------------
{
	const { amzDate, fecha } = marcasDeTiempo(new Date("2026-08-03T06:45:00.123Z"));
	assert.equal(amzDate, "20260803T064500Z", "sin guiones, sin dos puntos, sin milisegundos");
	assert.equal(fecha, "20260803");
}

// --- Percent-encoding --------------------------------------------------------------------------
// The characters encodeURIComponent leaves alone but AWS does not.
assert.equal(encodeRfc3986("a!b'c(d)e*f"), "a%21b%27c%28d%29e%2Af");
assert.equal(encodeRfc3986("carpeta/archivo.jpg"), "carpeta%2Farchivo.jpg");
assert.equal(encodeRfc3986("carpeta/archivo.jpg", true), "carpeta/archivo.jpg");
assert.equal(encodeRfc3986("acento é"), "acento%20%C3%A9");
assert.equal(encodeRfc3986("a+b"), "a%2Bb", "un + literal no debe volverse espacio");
// A key with punctuation still signs to a path that round-trips.
assert.equal(new URL(firmarUrl({ metodo: "PUT", ...EJEMPLO, ruta: "/b/foto (1).jpg" })).pathname, "/b/foto%20%281%29.jpg");

console.log("check-r2: OK");
