/**
 * Self-check for the service-note vocabulary and its state machine. Run: npm test
 *
 * Pure — no DB, no server. The rules here are the ones that would let a vehicle be in two places
 * at once, or a delivered job quietly come back to life.
 */
import assert from "node:assert/strict";
import {
	MIME_KEYS,
	isEvidenciaTipo,
	limiteDeTipo,
	tipoDeMime,
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
	QA_DESTINO_KEYS,
	isQaDestino,
	qaDestinoPorDefecto,
	qaSigueEnTaller,
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
assert.deepEqual(EVIDENCIA_TIPO_KEYS, ["foto", "documento", "audio", "video"]);
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

// The verdict and where the unit ends up are two separate answers. A rejection defaults to leaving
// it with the shop that owes the fix; anything accepted always comes back. If this inverted, an
// approved job would be left sitting at a partner shop nobody is waiting on.
assert.deepEqual(QA_DESTINO_KEYS, ["retrabajo", "retorno"]);
assert.equal(qaDestinoPorDefecto("rechazado"), "retrabajo");
assert.equal(qaDestinoPorDefecto("aprobado"), "retorno");
assert.equal(qaDestinoPorDefecto("con_detalles"), "retorno", "se acepta, con la observación asentada");
assert.equal(isQaDestino("retorno"), true);
assert.equal(isQaDestino("a_la_calle"), false);

// The unit stays at the partner shop in exactly ONE of the six combinations. Anything accepted
// comes back whatever `destino` says, and a rejection no longer chains the vehicle to the shop
// that botched it — that is what makes "rechazado, y me la llevo a otro taller" possible.
assert.equal(qaSigueEnTaller("rechazado", "retrabajo"), true);
assert.equal(qaSigueEnTaller("rechazado", "retorno"), false, "rechazar no obliga a dejársela");
assert.equal(qaSigueEnTaller("aprobado", "retrabajo"), false, "lo aprobado siempre regresa");
assert.equal(qaSigueEnTaller("aprobado", "retorno"), false);
assert.equal(qaSigueEnTaller("con_detalles", "retrabajo"), false, "lo aprobado siempre regresa");
assert.equal(qaSigueEnTaller("con_detalles", "retorno"), false);

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

// --- Adjuntos: el mime ES la clasificación -----------------------------------------------------
// Never the caller's word for it. A video labelled `foto` would render inside an `<img>` and a
// PDF inside a `<video>` — and the allowlist is what keeps `image/svg+xml` and `text/html` out of
// a bucket that serves them, which is an XSS.
assert.equal(tipoDeMime("image/jpeg"), "foto");
assert.equal(tipoDeMime("application/pdf"), "documento");
assert.equal(tipoDeMime("audio/mp4"), "audio");
assert.equal(tipoDeMime("video/quicktime"), "video");

for (const peligroso of ["image/svg+xml", "text/html", "application/javascript", "text/xml"]) {
	assert.equal(esMimePermitido(peligroso), false, `${peligroso} nunca se acepta`);
}
assert.equal(esMimePermitido("__proto__"), false, "deny by default incluye lo raro");
assert.equal(esMimePermitido(""), false);
assert.equal(esMimePermitido(null), false);

// Every allowed mime maps to a real `tipo`, or the row gets a value no screen knows how to draw.
for (const mime of MIME_KEYS) {
	assert.ok(isEvidenciaTipo(tipoDeMime(mime)), `${mime} apunta a un tipo que no existe`);
}
// And every `tipo` is reachable: an entry nothing can produce is dead vocabulary.
for (const tipo of EVIDENCIA_TIPO_KEYS) {
	assert.ok(
		MIME_KEYS.some((m) => tipoDeMime(m) === tipo),
		`ningún mime produce el tipo ${tipo}`,
	);
}

// Video gets more room: 20 MB is about eight seconds of 4K, which is the START of a clip, not one.
assert.equal(limiteDeTipo("foto"), TAMANO_MAXIMO_BYTES);
assert.equal(limiteDeTipo("documento"), TAMANO_MAXIMO_BYTES);
assert.equal(limiteDeTipo("audio"), TAMANO_MAXIMO_BYTES);
assert.ok(limiteDeTipo("video") > TAMANO_MAXIMO_BYTES);
// An unknown tipo falls to the SMALLER limit — the safe direction when in doubt.
assert.equal(limiteDeTipo("inventado"), TAMANO_MAXIMO_BYTES);

console.log("check-notas: OK");
