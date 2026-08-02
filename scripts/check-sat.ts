/**
 * Self-check for the SAT catalogs. Run: npm test
 *
 * The one rule the database cares about: every clave must fit `VarChar(8)`. Free text in
 * those fields is what produced "value too long for the column's type. Column: (not
 * available)" — a Postgres error that names neither the column nor a fix.
 */
import assert from "node:assert/strict";
import {
	REGIMENES_FISCALES,
	USOS_CFDI,
	satLabel,
	satParaTipo,
	regimenFiscal,
	usoCfdi,
} from "../src/lib/sat-catalogos.js";

for (const [nombre, catalogo] of [
	["regimenFiscal", REGIMENES_FISCALES],
	["usoCfdi", USOS_CFDI],
] as const) {
	const claves = new Set<string>();
	for (const entry of catalogo) {
		assert.ok(entry.clave.length <= 8, `${nombre}: "${entry.clave}" no cabe en VarChar(8)`);
		assert.ok(entry.label.trim() !== "", `${nombre}: ${entry.clave} sin descripción`);
		assert.ok(entry.fisica || entry.moral, `${nombre}: ${entry.clave} no aplica a nadie`);
		assert.equal(claves.has(entry.clave), false, `${nombre}: clave duplicada ${entry.clave}`);
		claves.add(entry.clave);
	}
	// Both customer types must have something to pick, or the form offers an empty select.
	assert.ok(satParaTipo(catalogo, "persona").length > 0);
	assert.ok(satParaTipo(catalogo, "organizacion").length > 0);
}

// The filter is the point: a moral-only régimen must never reach a persona, and vice versa.
assert.equal(
	satParaTipo(REGIMENES_FISCALES, "persona").some((e) => e.clave === "601"),
	false,
	"601 es solo para personas morales",
);
assert.equal(
	satParaTipo(REGIMENES_FISCALES, "organizacion").some((e) => e.clave === "605"),
	false,
	"605 (Sueldos y Salarios) es solo para personas físicas",
);
assert.equal(satParaTipo(USOS_CFDI, "organizacion").some((e) => e.clave === "D03"), false);
assert.equal(satParaTipo(USOS_CFDI, "persona").some((e) => e.clave === "G03"), true);

// Lookups.
assert.equal(regimenFiscal("626")?.label, "Régimen Simplificado de Confianza");
assert.equal(usoCfdi("G03")?.label, "Gastos en general");
assert.equal(regimenFiscal("999"), null);
assert.equal(regimenFiscal(null), null);

// An unknown key still renders — a customer keyed before a catalog update must not vanish.
assert.equal(satLabel(REGIMENES_FISCALES, "612"), "612 — Personas Físicas con Actividades Empresariales y Profesionales");
assert.equal(satLabel(USOS_CFDI, "ZZ99"), "ZZ99");
assert.equal(satLabel(USOS_CFDI, null), null);

console.log("check-sat: OK");
