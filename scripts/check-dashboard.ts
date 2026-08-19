/**
 * Self-check for the manager dashboard's period math. Run: npm test
 *
 * Pure — no DB. This is the logic a bad edit would break silently: which window each `rango`
 * preset resolves to, what "el periodo anterior" means for a given window, and the improvement
 * sign for a metric where LESS is the good direction.
 */
import assert from "node:assert/strict";
import { hoy, sumarDias } from "../src/lib/agenda.js";
import { lunesDe, periodoAnterior, resolverPeriodo, variacion } from "../src/lib/server/dashboard-periodo.js";

// --- resolverPeriodo -----------------------------------------------------------------------

const params = (obj: Record<string, string>) => new URLSearchParams(obj);

assert.deepEqual(resolverPeriodo(params({})), { desde: sumarDias(hoy(), -29), hasta: hoy(), rango: "30d" });
assert.deepEqual(resolverPeriodo(params({ rango: "hoy" })), { desde: hoy(), hasta: hoy(), rango: "hoy" });
assert.deepEqual(resolverPeriodo(params({ rango: "mes" })), {
	desde: `${hoy().slice(0, 7)}-01`,
	hasta: hoy(),
	rango: "mes",
});
assert.deepEqual(resolverPeriodo(params({ rango: "anio" })), {
	desde: `${hoy().slice(0, 4)}-01-01`,
	hasta: hoy(),
	rango: "anio",
});
// An unknown rango falls back to the default rather than erroring on a stale/tampered querystring.
assert.equal(resolverPeriodo(params({ rango: "quincena" })).rango, "30d");

// personalizado: a backwards range is swapped, not rejected — the person just filled it out of order.
assert.deepEqual(resolverPeriodo(params({ rango: "personalizado", desde: "2026-03-10", hasta: "2026-03-01" })), {
	desde: "2026-03-01",
	hasta: "2026-03-10",
	rango: "personalizado",
});

// lunesDe: Monday of the week is always a Monday, whatever day of the week `fecha` is.
for (const fecha of ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-23"]) {
	const lunes = lunesDe(fecha);
	const dow = new Date(`${lunes}T12:00:00-07:00`).getUTCDay();
	assert.equal(dow, 1, `${fecha} -> ${lunes} should be a Monday`);
}

// --- periodoAnterior -------------------------------------------------------------------------

// A 7-day window's "periodo anterior" is the 7 days immediately before it, same length.
assert.deepEqual(periodoAnterior({ desde: "2026-08-10", hasta: "2026-08-16", rango: "semana" }), {
	desde: "2026-08-03",
	hasta: "2026-08-09",
});
// A single day's periodo anterior is the single day before it.
assert.deepEqual(periodoAnterior({ desde: "2026-08-16", hasta: "2026-08-16", rango: "hoy" }), {
	desde: "2026-08-15",
	hasta: "2026-08-15",
});

// --- variacion ---------------------------------------------------------------------------------

// Ventas subieron: más es mejor por default.
assert.deepEqual(variacion(150, 100), { pct: 50, mejora: true });
assert.deepEqual(variacion(50, 100), { pct: -50, mejora: false });
// Tiempo de reparación bajó: menos es mejor, así que una BAJA es una mejora.
assert.deepEqual(variacion(3, 5, true), { pct: -40, mejora: true });
assert.deepEqual(variacion(6, 5, true), { pct: 20, mejora: false });
// Sin cambio: ni mejora ni empeora.
assert.deepEqual(variacion(10, 10), { pct: 0, mejora: null });
// Base cero: no hay "porcentaje de nada" — pero la dirección del cambio sigue siendo real.
assert.deepEqual(variacion(0, 0), { pct: 0, mejora: null });
assert.deepEqual(variacion(5, 0), { pct: null, mejora: true });
assert.deepEqual(variacion(5, 0, true), { pct: null, mejora: false });

console.log("check-dashboard: OK");
