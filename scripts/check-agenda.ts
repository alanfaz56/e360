/**
 * Self-check for the calendar math and the appointment state machine. Run: npm test
 *
 * All pure — no DB, no server. These are the rules a bad edit to src/lib/agenda.ts or
 * src/lib/citas.ts would break silently: the shop's fixed timezone, week boundaries, the
 * overlap layout, and the fact that a finished appointment cannot come back to life.
 */
import assert from "node:assert/strict";
import {
	acomodar,
	enZona,
	fechaEnZona,
	horaEnZona,
	parseFecha,
	posicion,
	rangoVista,
	semanaDe,
	sumarDias,
} from "../src/lib/agenda.js";
import {
	CITA_ESTADO_KEYS,
	CITA_TIPO_KEYS,
	CITA_TIPO_DEFAULT,
	TRANSICIONES,
	FRANJAS,
	REQUIEREN_HORA,
	requiereHora,
	puedeTransicionar,
	isCitaEstado,
	isCitaTipo,
	isFranja,
} from "../src/lib/citas.js";

// --- Timezone --------------------------------------------------------------------------------
// Hermosillo is UTC-7 all year. 09:00 local is 16:00Z in August AND in January — if this ever
// starts differing by month, someone reintroduced DST handling and the whole grid shifts.
assert.equal(enZona("2026-08-05", "09:00").toISOString(), "2026-08-05T16:00:00.000Z");
assert.equal(enZona("2026-01-15", "09:00").toISOString(), "2026-01-15T16:00:00.000Z");
assert.equal(enZona("2026-08-05").toISOString(), "2026-08-05T07:00:00.000Z");

// Round trip: an instant maps back to the calendar day the shop would call it.
assert.equal(fechaEnZona(enZona("2026-08-05", "23:30")), "2026-08-05");
// 00:30Z on the 6th is still the evening of the 5th in Hermosillo — the case a naive
// `toISOString().slice(0,10)` gets wrong.
assert.equal(fechaEnZona(new Date("2026-08-06T00:30:00Z")), "2026-08-05");
assert.equal(horaEnZona(new Date("2026-08-06T00:30:00Z")), "17:30");

// --- parseFecha ------------------------------------------------------------------------------
assert.equal(parseFecha("2026-08-05"), "2026-08-05");
assert.equal(parseFecha("2026-02-31"), null, "Date would roll this to March; it must be refused");
assert.equal(parseFecha("2026-8-5"), null);
assert.equal(parseFecha("ayer"), null);
assert.equal(parseFecha(null), null);
assert.equal(parseFecha(20260805), null);
// Leap day is real in 2028 and not in 2027.
assert.equal(parseFecha("2028-02-29"), "2028-02-29");
assert.equal(parseFecha("2027-02-29"), null);

// --- The rolling week ------------------------------------------------------------------------
// The week STARTS at the anchor date — it is not Monday-aligned. With the anchor defaulting to
// today, that is what puts today in the first column, where the counter needs it.
const semana = semanaDe("2026-08-05");
assert.equal(semana.length, 7);
assert.equal(semana[0], "2026-08-05", "the anchor day must be first");
assert.equal(semana[6], "2026-08-11");

// Across a month boundary it still spans exactly 7 consecutive days.
const cruce = semanaDe("2026-08-29");
assert.equal(cruce.length, 7);
assert.equal(cruce[0], "2026-08-29");
assert.equal(cruce[6], "2026-09-04");
assert.equal(new Set(cruce).size, 7, "no repeated days");

// Consecutive, in order, no gaps.
for (let i = 1; i < cruce.length; i++) {
	assert.equal(cruce[i], sumarDias(cruce[i - 1], 1));
}

// Leap year, since February is where day arithmetic goes wrong.
assert.equal(semanaDe("2028-02-26")[6], "2028-03-03");

assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
assert.equal(sumarDias("2026-03-01", -1), "2026-02-28");

assert.deepEqual(rangoVista("dia", "2026-08-05"), { desde: "2026-08-05", hasta: "2026-08-05" });
assert.deepEqual(rangoVista("semana", "2026-08-05"), { desde: "2026-08-05", hasta: "2026-08-11" });

// --- acomodar --------------------------------------------------------------------------------
const at = (h: string, m = "00") => enZona("2026-08-05", `${h}:${m}`);
const bloque = (desde: string, hasta: string, id: string) => ({
	id,
	inicio: at(desde.slice(0, 2), desde.slice(3)),
	fin: at(hasta.slice(0, 2), hasta.slice(3)),
});
const porId = (r: { id: string; col: number; cols: number }[]) =>
	Object.fromEntries(r.map((x) => [x.id, { col: x.col, cols: x.cols }]));

assert.deepEqual(acomodar([]), []);

// Disjoint appointments each take the full width.
{
	const r = porId(acomodar([bloque("09:00", "10:00", "a"), bloque("11:00", "12:00", "b")]));
	assert.deepEqual(r, { a: { col: 0, cols: 1 }, b: { col: 0, cols: 1 } });
}

// Back to back is NOT an overlap — a 10:00 end and a 10:00 start must not each go half width.
{
	const r = porId(acomodar([bloque("09:00", "10:00", "a"), bloque("10:00", "11:00", "b")]));
	assert.deepEqual(r, { a: { col: 0, cols: 1 }, b: { col: 0, cols: 1 } });
}

// Two that really overlap split the column.
{
	const r = porId(acomodar([bloque("09:00", "10:00", "a"), bloque("09:30", "10:30", "b")]));
	assert.deepEqual(r, { a: { col: 0, cols: 2 }, b: { col: 1, cols: 2 } });
}

// The chain case: A∩B and B∩C, but A and C do not overlap. Three appointments, only two
// columns — A and C share one. A naive "count everything in the cluster" gives a wrong 3.
{
	const r = porId(
		acomodar([bloque("09:00", "10:00", "a"), bloque("09:30", "11:00", "b"), bloque("10:30", "12:00", "c")]),
	);
	assert.deepEqual(r, { a: { col: 0, cols: 2 }, b: { col: 1, cols: 2 }, c: { col: 0, cols: 2 } });
}

// Three genuinely simultaneous appointments need three columns.
{
	const r = porId(
		acomodar([bloque("09:00", "10:00", "a"), bloque("09:00", "10:00", "b"), bloque("09:00", "10:00", "c")]),
	);
	assert.deepEqual(r, { a: { col: 0, cols: 3 }, b: { col: 1, cols: 3 }, c: { col: 2, cols: 3 } });
}

// A separate cluster later in the day is not widened by an earlier one.
{
	const r = porId(
		acomodar([bloque("09:00", "10:00", "a"), bloque("09:00", "10:00", "b"), bloque("15:00", "16:00", "c")]),
	);
	assert.deepEqual(r.c, { col: 0, cols: 1 });
}

// Input order must not change the outcome, and nothing may be dropped.
{
	const uno = acomodar([bloque("09:00", "10:00", "a"), bloque("09:30", "10:30", "b")]);
	const otro = acomodar([bloque("09:30", "10:30", "b"), bloque("09:00", "10:00", "a")]);
	assert.deepEqual(porId(uno), porId(otro));
	assert.equal(uno.length, 2);
}

// --- posicion --------------------------------------------------------------------------------
// The grid runs 07:00–19:00, so 07:00 is the top and 13:00 is exactly halfway.
{
	const p = posicion(at("07"), at("08"));
	assert.equal(p.top, 0);
	assert.ok(Math.abs(p.alto - 100 / 12) < 0.001);

	assert.equal(posicion(at("13"), at("14")).top, 50);
	// Anything shorter than the floor still stays clickable.
	assert.ok(posicion(at("09"), at("09", "05")).alto >= 4);
}

// --- The state machine -----------------------------------------------------------------------
assert.equal(puedeTransicionar("solicitada", "confirmada"), true);
assert.equal(puedeTransicionar("confirmada", "en_proceso"), true);
assert.equal(puedeTransicionar("en_proceso", "completada"), true);

// THE RULE THE DATABASE ALSO ENFORCES. A `solicitada` has no `inicio`, and every estado except
// `solicitada`/`cancelada` requires one (cita_inicio_requerido_check). So no transition out of
// `solicitada` may land on an estado that needs an hour — the only ones that can set an hour are
// confirmarCita and actualizarCita. Getting this wrong surfaces as a raw constraint violation.
assert.deepEqual([...REQUIEREN_HORA], ["confirmada", "en_proceso", "completada", "no_asistio"]);
assert.equal(requiereHora("solicitada"), false);
assert.equal(requiereHora("cancelada"), false);
for (const destino of TRANSICIONES.solicitada) {
	assert.equal(
		requiereHora(destino) && destino !== "confirmada",
		false,
		`solicitada -> ${destino} would violate cita_inicio_requerido_check`,
	);
}
assert.equal(puedeTransicionar("solicitada", "no_asistio"), false, "nothing to not show up to yet");
assert.equal(puedeTransicionar("solicitada", "completada"), false);
assert.equal(puedeTransicionar("solicitada", "en_proceso"), false);
// Once it has an hour, "no asistió" is exactly the right thing to record.
assert.equal(puedeTransicionar("confirmada", "no_asistio"), true);

// Nothing comes back from a terminal estado. This is the guard that keeps a finished job from
// being reopened, or a cancelled one from silently becoming live again.
for (const terminal of ["completada", "cancelada", "no_asistio"] as const) {
	assert.deepEqual([...TRANSICIONES[terminal]], [], `${terminal} must be terminal`);
	for (const destino of CITA_ESTADO_KEYS) {
		assert.equal(puedeTransicionar(terminal, destino), false, `${terminal} -> ${destino}`);
	}
}

// No estado may transition to itself, and every listed destination must be a real estado.
for (const desde of CITA_ESTADO_KEYS) {
	assert.equal(puedeTransicionar(desde, desde), false, `${desde} -> ${desde}`);
	for (const hasta of TRANSICIONES[desde]) {
		assert.ok(isCitaEstado(hasta), `${desde} lists unknown estado ${hasta}`);
	}
}

// Every live estado can be cancelled — cancelarCita relies on this being reachable.
for (const desde of ["solicitada", "confirmada", "en_proceso"] as const) {
	assert.equal(puedeTransicionar(desde, "cancelada"), true, `${desde} must be cancellable`);
}

// Unknown values are denied, not crashed on.
assert.equal(puedeTransicionar("inventado", "confirmada"), false);
assert.equal(puedeTransicionar("confirmada", "inventado"), false);
assert.equal(isCitaEstado("solicitada"), true);
assert.equal(isCitaEstado("pendiente"), false);
assert.equal(isCitaTipo("recoleccion"), true);
assert.equal(isCitaTipo("domicilio"), false);
assert.equal(isFranja("manana"), true);
assert.equal(isFranja("noche"), false);

// Franjas must not overlap, or "mañana" and "tarde" would suggest the same hour.
assert.equal(FRANJAS.manana.hasta, FRANJAS.tarde.desde);

// Recolección is a core part of what the shop sells, so it leads the picker and is the default.
// Key order drives the UI, so a reorder here silently changes what customers pick first.
assert.equal(CITA_TIPO_DEFAULT, "recoleccion");
assert.equal(CITA_TIPO_KEYS[0], "recoleccion", "recolección must be offered first");
assert.deepEqual(CITA_TIPO_KEYS, ["recoleccion", "en_sitio"]);

console.log("check-agenda: OK");
