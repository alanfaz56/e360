/**
 * Self-check for the money math and the commercial state machines. Run: npm test
 *
 * Pure — no DB, no server. Everything here is a rule that would cost somebody real pesos if it
 * broke quietly: parsing amounts, totalling lines, computing IVA, and refusing to let a finished
 * quote or a cancelled invoice come back to life.
 */
import assert from "node:assert/strict";
import {
	COTIZACION_ESTADO_KEYS,
	COTIZACION_TRANSICIONES,
	FACTURA_ESTADO_KEYS,
	FACTURA_TRANSICIONES,
	IVA,
	centavos,
	esCredito,
	formatoPesos,
	importeConcepto,
	isCondicionPago,
	isConceptoTipo,
	isMetodoPago,
	pesos,
	puedeTransicionarCotizacion,
	puedeTransicionarFactura,
	totales,
} from "../src/lib/comercial.js";

// --- Parsing amounts ---------------------------------------------------------------------------
// The one place a string from a form becomes money. Everything downstream trusts it.
assert.equal(centavos("0"), 0n);
assert.equal(centavos("1234.50"), 123450n);
assert.equal(centavos("1234.5"), 123450n, "un decimal se completa a dos");
assert.equal(centavos("1234"), 123400n);
assert.equal(centavos("0.01"), 1n);
assert.equal(centavos(" 99.99 "), 9999n, "los espacios no cuentan");
assert.equal(centavos(1234.5), 123450n);
assert.equal(centavos(0n), 0n);

// Anything that is not unambiguously an amount is refused rather than guessed at.
for (const malo of ["", "abc", "-5", "1.234", "1,234.50", "1e3", ".5", "5.", null, undefined, {}, NaN]) {
	assert.equal(centavos(malo), null, `centavos(${JSON.stringify(malo)}) debe ser null`);
}
assert.equal(centavos(-1n), null, "un negativo nunca es un monto válido");

// Round trip. If this ever drifts, every total in the system drifts with it.
for (const texto of ["0.00", "0.01", "1.00", "99.99", "1234.50", "999999.99"]) {
	assert.equal(pesos(centavos(texto)!), texto, `ida y vuelta de ${texto}`);
}
assert.equal(pesos(0n), "0.00");
assert.equal(pesos(5n), "0.05");
assert.equal(pesos(100n), "1.00");
assert.equal(pesos(-2550n), "-25.50", "un saldo a favor se lee como negativo");

// --- Line amounts ------------------------------------------------------------------------------
assert.equal(importeConcepto(1, 123450n), 123450n);
assert.equal(importeConcepto(3, 10000n), 30000n);
// Fractional quantities are real: 1.5 hours of labour.
assert.equal(importeConcepto(1.5, 45000n), 67500n);
// A third of a peso has to land somewhere; it rounds to the cent rather than carrying a fraction.
assert.equal(importeConcepto(3, 33n), 99n);
assert.equal(importeConcepto(0.5, 33n), 17n, "0.165 redondea a 0.17");

// --- Totals and IVA ----------------------------------------------------------------------------
{
	const { subtotal, iva, total } = totales([
		{ cantidad: 2, precioUnitario: 50000n }, // 1000.00
		{ cantidad: 1.5, precioUnitario: 45000n }, // 675.00
	]);
	assert.equal(pesos(subtotal), "1675.00");
	assert.equal(pesos(iva), "268.00");
	assert.equal(pesos(total), "1943.00");
	// The invariant the database also enforces (factura_montos_check).
	assert.equal(total, subtotal + iva);
}

// IVA on the rounded subtotal, not per line — that is how a CFDI is expected to add up, and it
// stops the total from disagreeing with the sum of its own lines by a cent.
{
	const lineas = Array.from({ length: 3 }, () => ({ cantidad: 1, precioUnitario: 3333n }));
	const { subtotal, iva, total } = totales(lineas);
	assert.equal(pesos(subtotal), "99.99");
	assert.equal(pesos(iva), "16.00");
	assert.equal(total, subtotal + iva);
}

assert.deepEqual(totales([]), { subtotal: 0n, iva: 0n, total: 0n }, "sin conceptos, todo en cero");
assert.equal(IVA, 0.16);
// A zero-rated total still satisfies total = subtotal + iva.
{
	const t = totales([{ cantidad: 1, precioUnitario: 10000n }], 0);
	assert.equal(pesos(t.iva), "0.00");
	assert.equal(t.total, t.subtotal);
}

// --- Display -----------------------------------------------------------------------------------
assert.ok(formatoPesos(123450n).includes("1,234.50"), formatoPesos(123450n));

// --- Cotización: once seen by the customer, the numbers are frozen -----------------------------
assert.equal(puedeTransicionarCotizacion("borrador", "enviada"), true);
assert.equal(puedeTransicionarCotizacion("enviada", "autorizada"), true);
assert.equal(puedeTransicionarCotizacion("enviada", "rechazada"), true);
assert.equal(puedeTransicionarCotizacion("enviada", "borrador"), false, "no se regresa a borrador");
for (const terminal of ["autorizada", "rechazada", "vencida"] as const) {
	assert.deepEqual([...COTIZACION_TRANSICIONES[terminal]], [], `${terminal} es terminal`);
	for (const destino of COTIZACION_ESTADO_KEYS) {
		assert.equal(puedeTransicionarCotizacion(terminal, destino), false, `${terminal} -> ${destino}`);
	}
}
for (const desde of COTIZACION_ESTADO_KEYS) {
	assert.equal(puedeTransicionarCotizacion(desde, desde), false, `${desde} -> ${desde}`);
}
assert.equal(puedeTransicionarCotizacion("inventado", "enviada"), false);

// --- Factura: `pagada` is arithmetic, never a button -------------------------------------------
assert.equal(puedeTransicionarFactura("borrador", "emitida"), true);
assert.equal(puedeTransicionarFactura("emitida", "cancelada"), true);
for (const desde of FACTURA_ESTADO_KEYS) {
	assert.equal(
		puedeTransicionarFactura(desde, "pagada"),
		false,
		"'pagada' se alcanza registrando pagos, no marcándola",
	);
}
assert.deepEqual([...FACTURA_TRANSICIONES.cancelada], [], "cancelada es terminal");
assert.equal(puedeTransicionarFactura("cancelada", "emitida"), false);

// --- Vocabulary --------------------------------------------------------------------------------
assert.equal(esCredito("credito"), true);
assert.equal(esCredito("contado"), false, "solo el crédito consume el límite");
assert.equal(esCredito("inventado"), false);
assert.equal(isCondicionPago("credito"), true);
assert.equal(isCondicionPago("mensualidades"), false);
assert.equal(isMetodoPago("efectivo"), true);
assert.equal(isMetodoPago("bitcoin"), false);
assert.equal(isConceptoTipo("mano_obra"), true);
assert.equal(isConceptoTipo("propina"), false);

console.log("check-comercial: OK");
