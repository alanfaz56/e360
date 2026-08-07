/**
 * Self-check for what a failure is allowed to say. Run: npm test
 *
 * Pure — no DB, no server, no Svelte. The rule being pinned is a security rule as much as a
 * usability one: an internal message reaching a screen tells an attacker about the schema and
 * tells everybody else nothing they can act on. A rule nothing checks is a rule that drifts.
 */
import assert from "node:assert/strict";
import {
	ErrorVisible,
	MENSAJE_INTERNO,
	conReferencia,
	mensajeDeExcepcion,
	mensajePorEstado,
} from "../src/lib/errores.js";

const SECRETO =
	'insert into "cliente" ... violates check constraint "cliente_rfc_check" at /srv/app/build/server.js:4212';

// --- Nothing internal ever reaches a screen ----------------------------------------------------
// The one assertion this whole file exists for. An ordinary Error's message is written by whoever
// threw it — a driver, a browser, a library — for somebody debugging, never for the counter.
{
	const salida = mensajeDeExcepcion(new Error(SECRETO), "No se pudo guardar.");
	assert.equal(salida, "No se pudo guardar.");
	assert.ok(!salida.includes("constraint"), "una restricción de la base nunca se muestra");
	assert.ok(!salida.includes("/srv/"), "una ruta del servidor nunca se muestra");
}

// Subclasses of Error are still errors somebody else worded.
assert.equal(mensajeDeExcepcion(new RangeError(SECRETO), "Falló."), "Falló.");
// And so is anything that is not an Error at all.
assert.equal(mensajeDeExcepcion(SECRETO, "Falló."), "Falló.");
assert.equal(mensajeDeExcepcion({ message: SECRETO }, "Falló."), "Falló.");
assert.equal(mensajeDeExcepcion(null, "Falló."), "Falló.");
assert.equal(mensajeDeExcepcion(undefined, "Falló."), "Falló.");

// --- The one exception: a message written to be read -------------------------------------------
assert.equal(
	mensajeDeExcepcion(new ErrorVisible("Ese cliente ya tiene una nota abierta."), "Falló."),
	"Ese cliente ya tiene una nota abierta.",
);

// Matched by `name`, not `instanceof`: the class crosses bundle boundaries, and an identity check
// fails there silently — in exactly the case it exists for.
{
	const deOtroBundle = new Error("Ese cliente ya tiene una nota abierta.");
	deOtroBundle.name = "ErrorVisible";
	assert.equal(mensajeDeExcepcion(deOtroBundle, "Falló."), "Ese cliente ya tiene una nota abierta.");
}

// --- Sin conexión is its own answer ------------------------------------------------------------
// A failed `fetch` throws a TypeError. "Failed to fetch" is the single most useless string a user
// can be shown, and the fix ("revisa tu internet") is one they can actually carry out.
{
	const salida = mensajeDeExcepcion(new TypeError("Failed to fetch"), "No se pudo buscar.");
	assert.match(salida, /conexión/i);
	assert.ok(!salida.includes("fetch"));
}

// --- Statuses lead somewhere different ---------------------------------------------------------
// A 403 is not "try again": nothing the user repeats will work, so it has to say what to do.
assert.match(mensajePorEstado(401, "No se pudo."), /Vuelve a entrar/);
assert.match(mensajePorEstado(403, "No se pudo."), /Vuelve a entrar/);
assert.match(mensajePorEstado(429, "No se pudo."), /Espera un momento/);

// A 5xx says whose fault it is. Blaming the person standing at the counter for our outage is how
// they stop reporting anything.
for (const status of [500, 502, 503, 504]) {
	const salida = mensajePorEstado(status, "No pudimos guardar.");
	assert.match(salida, /problema nuestro/, `${status} debe decir de quién es la falla`);
	assert.ok(salida.startsWith("No pudimos guardar."), `${status} debe decir QUÉ falló`);
}

// A 4xx we have no special copy for still says what was being attempted — "error 418" is not
// something anybody can act on.
assert.equal(mensajePorEstado(400, "No pudimos guardar."), "No pudimos guardar.");
assert.equal(mensajePorEstado(418, "No pudimos guardar."), "No pudimos guardar.");
assert.match(mensajePorEstado(404, "No pudimos abrirlo."), /No encontramos/);

// --- The reference is what makes a report actionable -------------------------------------------
// Without it "algo falló" is unfindable in a log, and the user has nothing to read out on the phone.
{
	const salida = conReferencia("4F2A91");
	assert.ok(salida.includes("4F2A91"));
	assert.ok(salida.startsWith(MENSAJE_INTERNO));
	assert.ok(!salida.includes("undefined"));
}

console.log("check-errores: OK");
