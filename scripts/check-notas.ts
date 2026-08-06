/**
 * Self-check for the service-note vocabulary and its state machine. Run: npm test
 *
 * Pure — no DB, no server. The rules here are the ones that would let a vehicle be in two places
 * at once, or a delivered job quietly come back to life.
 */
import assert from "node:assert/strict";
import {
	COMBUSTIBLE_LABELS,
	COMBUSTIBLE_MAX,
	EVIDENCIA_TIPO_KEYS,
	FOTOS_SUGERIDAS,
	FOTO_CATEGORIA_KEYS,
	INVENTARIO_ITEM_KEYS,
	INVENTARIO_OBLIGATORIOS,
	NOTA_ESTADOS,
	NOTA_ESTADOS_ABIERTOS,
	NOTA_ESTADO_CLIENTE,
	NOTA_ESTADO_KEYS,
	NOTA_TRANSICIONES,
	QA_RESULTADO_KEYS,
	TAMANO_MAXIMO_BYTES,
	combustibleLabel,
	esMimePermitido,
	inventarioLabel,
	isFotoCategoria,
	isInventarioItem,
	isNotaEstado,
	isQaResultado,
	notaEstadoClienteLabel,
	notaEstadoLabel,
	puedeTransicionarNota,
	qaExigeRetorno,
	qaResultadoLabel,
} from "../src/lib/notas.js";

// --- The state machine ------------------------------------------------------------------------
assert.equal(puedeTransicionarNota("recibida", "en_diagnostico"), true);
assert.equal(puedeTransicionarNota("en_diagnostico", "en_taller"), true);
assert.equal(puedeTransicionarNota("lista", "entregada"), true);

// A partner shop handing the unit back WITHOUT doing the work is normal, not a failure state.
assert.equal(puedeTransicionarNota("en_taller", "en_diagnostico"), true);
// And a job found incomplete after being marked ready can go back for more work.
assert.equal(puedeTransicionarNota("lista", "en_diagnostico"), true);

// Terminal means terminal: a vehicle that already left cannot become "in repair" again.
for (const terminal of ["entregada", "cancelada"] as const) {
	assert.deepEqual([...NOTA_TRANSICIONES[terminal]], [], `${terminal} es terminal`);
	for (const destino of NOTA_ESTADO_KEYS) {
		assert.equal(puedeTransicionarNota(terminal, destino), false, `${terminal} -> ${destino}`);
	}
}
for (const desde of NOTA_ESTADO_KEYS) {
	assert.equal(puedeTransicionarNota(desde, desde), false, `${desde} -> ${desde}`);
	for (const hasta of NOTA_TRANSICIONES[desde]) {
		assert.ok(isNotaEstado(hasta), `${desde} apunta a un estado inexistente: ${hasta}`);
	}
}
assert.equal(puedeTransicionarNota("inventado", "lista"), false);

// Delivery is only reachable from `lista`: a unit is handed back after the work is finished, not
// in the middle of it. This is what makes the "márcala como lista primero" error correct.
for (const desde of NOTA_ESTADO_KEYS) {
	if (desde === "lista") continue;
	assert.equal(puedeTransicionarNota(desde, "entregada"), false, `${desde} -> entregada`);
}

// Every live estado can be cancelled — `cancelarNota` relies on it being reachable.
for (const desde of ["recibida", "en_diagnostico", "en_taller", "lista"] as const) {
	assert.equal(puedeTransicionarNota(desde, "cancelada"), true, `${desde} debe poder cancelarse`);
}

// "Open" = the shop is still responsible for the vehicle. Drives the abiertas filter AND the
// "one open note per unit" guard, so a mistake here would let a truck be admitted twice.
assert.deepEqual(NOTA_ESTADOS_ABIERTOS, ["recibida", "en_diagnostico", "en_taller", "lista"]);
assert.equal(NOTA_ESTADOS_ABIERTOS.includes("entregada" as never), false);
assert.equal(NOTA_ESTADOS_ABIERTOS.includes("cancelada" as never), false);

assert.equal(notaEstadoLabel("en_taller"), "En taller externo");
assert.equal(notaEstadoLabel("inventado"), "inventado", "un estado desconocido se muestra tal cual");

// --- The fuel gauge ---------------------------------------------------------------------------
// Eighths, because that is what the needle shows. The CHECK constraint mirrors this range.
assert.equal(COMBUSTIBLE_MAX, 8);
assert.equal(Object.keys(COMBUSTIBLE_LABELS).length, 9, "de 0 a 8 inclusive");
assert.equal(combustibleLabel(0), "Vacío");
assert.equal(combustibleLabel(4), "1/2");
assert.equal(combustibleLabel(8), "Lleno");
assert.equal(combustibleLabel(null), "Sin registrar");

// --- The intake checklist ---------------------------------------------------------------------
// A fixed catalogue is the whole point: the same things get checked every time, so a missing jack
// is noticed on delivery instead of argued about.
assert.ok(INVENTARIO_ITEM_KEYS.length >= 10);
assert.equal(new Set(INVENTARIO_ITEM_KEYS).size, INVENTARIO_ITEM_KEYS.length, "sin duplicados");
for (const item of ["llanta_refaccion", "gato", "documentos"] as const) {
	assert.ok(INVENTARIO_OBLIGATORIOS.includes(item), `${item} debe ser obligatorio`);
}
assert.equal(isInventarioItem("gato"), true);
assert.equal(isInventarioItem("perro"), false);
assert.equal(inventarioLabel("gato"), "Gato");
assert.equal(inventarioLabel("desconocido"), "desconocido");

// --- Evidence ---------------------------------------------------------------------------------
assert.deepEqual(EVIDENCIA_TIPO_KEYS, ["foto", "documento"]);
// The angles the shop wants on every intake, so a damage claim later has a "before" picture.
for (const c of ["frente", "trasera", "lateral_izquierdo", "lateral_derecho", "tablero"] as const) {
	assert.ok(FOTOS_SUGERIDAS.includes(c), `${c} debe sugerirse en toda entrada`);
}
assert.ok(FOTO_CATEGORIA_KEYS.includes("dano"), "tiene que poder documentarse un daño");
assert.equal(isFotoCategoria("frente"), true);
assert.equal(isFotoCategoria("selfie"), false);

// Only these reach R2. Anything else is refused BEFORE a URL is ever signed.
assert.equal(esMimePermitido("image/jpeg"), true);
assert.equal(esMimePermitido("image/heic"), true, "las fotos de iPhone llegan así");
assert.equal(esMimePermitido("application/pdf"), true);
assert.equal(esMimePermitido("application/x-msdownload"), false);
assert.equal(esMimePermitido("text/html"), false, "un HTML servido desde el bucket es un XSS");
assert.equal(esMimePermitido("image/svg+xml"), false, "un SVG puede traer script");
assert.equal(esMimePermitido(""), false);
assert.equal(esMimePermitido(null), false);
assert.equal(TAMANO_MAXIMO_BYTES, 20 * 1024 * 1024);

// --- QA on return from a partner workshop ------------------------------------------------------
assert.deepEqual(QA_RESULTADO_KEYS, ["aprobado", "con_detalles", "rechazado"]);
assert.equal(isQaResultado("aprobado"), true);
assert.equal(isQaResultado("mas_o_menos"), false);
assert.equal(qaResultadoLabel(null), "Sin revisar", "sin veredicto no es lo mismo que aprobado");

// Only a rejection sends the unit back; the other two accept it. If this inverted, a bad repair
// would be released to the customer.
assert.equal(qaExigeRetorno("rechazado"), true);
assert.equal(qaExigeRetorno("aprobado"), false);
assert.equal(qaExigeRetorno("con_detalles"), false, "se acepta, con la observación asentada");

// --- The partner workshop is invisible to the customer -----------------------------------------
// Estación 360 sources the job out and answers for it. Handing the customer the partner's name
// invites them to go straight there next time, cutting out the shop that found and warranties
// the work — so `en_taller` must read as ordinary progress on the customer side.
assert.equal(notaEstadoClienteLabel("en_taller"), "En proceso de reparación");
assert.ok(
	!/taller externo|aliado/i.test(notaEstadoClienteLabel("en_taller")),
	"la etiqueta para el cliente no puede delatar que el trabajo se subcontrató",
);
// Every internal estado needs a customer-facing counterpart, or a new one leaks the raw key.
for (const estado of NOTA_ESTADO_KEYS) {
	assert.ok(NOTA_ESTADO_CLIENTE[estado], `falta la etiqueta para cliente de ${estado}`);
	assert.notEqual(
		NOTA_ESTADO_CLIENTE[estado],
		NOTA_ESTADOS.en_taller.label,
		`${estado} no debe usar la etiqueta interna del taller`,
	);
}
// An unknown estado degrades to something safe rather than exposing the key.
assert.equal(notaEstadoClienteLabel("inventado"), "En proceso");

console.log("check-notas: OK");
