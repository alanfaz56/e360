/**
 * Self-check for the partner-workshop name matcher. Run: npm test
 *
 * Pure — no DB. Exercises `nombreMencionado`, the matcher behind `tallerMencionado`, which guards
 * against a customer-facing comment or quote line leaking which partner shop did the work.
 */
import assert from "node:assert/strict";
import { nombreMencionado } from "../src/lib/nombre-mencionado.js";

// --- No false positive on ordinary text sharing no real word with any taller name -------------
assert.equal(nombreMencionado("El carro tira humo negro", ["El Sahuaro"]), null);
assert.equal(nombreMencionado("Quedó todo sahuaroso", ["El Sahuaro"]), null, "substring inside a longer word must not match");

// --- Real mentions still caught ------------------------------------------------------------
assert.equal(nombreMencionado("Lo llevé con el Sahuaro", ["El Sahuaro"]), "El Sahuaro");
assert.equal(nombreMencionado("me lo entregó Sahuaro ayer", ["El Sahuaro"]), "El Sahuaro", "distinctive word alone is enough");

// --- Accents: unaccented input still matches an accented name, and vice versa ------------------
assert.equal(nombreMencionado("lo atendio perez", ["Taller Pérez"]), "Taller Pérez");
assert.equal(nombreMencionado("lo atendió Pérez", ["Taller Perez"]), "Taller Perez");

// --- Punctuation/hyphens: a name segment must match on its own, not just the whole token -------
// ("Ruiz" alone is only 4 chars, under the length>=5 distinctive-word bar, so it correctly does
// NOT match on its own — "Hernández" (9 chars) does.)
assert.equal(nombreMencionado("lo atendió Hernández", ["Ruiz-Hernández"]), "Ruiz-Hernández");
assert.equal(nombreMencionado("lo atendió Ruiz", ["Ruiz-Hernández"]), null);

// --- Generic words never trip it alone ----------------------------------------------------
assert.equal(nombreMencionado("llévalo a un taller de autos", ["Taller Central SA de CV"]), null);

// --- Short/no talleres configured -> no crash, no match -----------------------------------------
assert.equal(nombreMencionado("cualquier cosa", []), null);

console.log("check-talleres: OK");
