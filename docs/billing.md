# Dinero — cotización, nota de venta, factura, crédito

Domain code: [src/lib/comercial.ts](../src/lib/comercial.ts) (browser-safe vocabulary, state
machines, money helpers) and [src/lib/server/comercial.ts](../src/lib/server/comercial.ts)
(everything that touches the database).

## Money representation

**Never floats.** Every amount is a `Decimal(12,2)` column and a string in the API, but every
calculation happens in **integer cents as a `bigint`** — `centavos()` parses a string into cents,
`pesos()` turns cents back into the "1234.50" string the API and the database use, `dec()` (server
only) wraps cents back into a `Prisma.Decimal` for a write. A peso that drifts by a cent because of
binary floating point is a peso somebody argues about at the counter, so nothing here ever holds an
amount as a JS `number`.

`totales()` computes IVA on the **rounded subtotal**, never per line — that's how a CFDI is
expected to add up, and it's what keeps an invoice's total agreeing with the sum of its own lines.

## The three documents

```
cotización (borrador → enviada → autorizada/rechazada)
        │ autorizada
        ├── nota de venta (sin IVA) ──(cliente pide CFDI)──▶ factura (+IVA)
        └── factura (+IVA) directo
```

### Cotización

What the customer sees and answers. `estado` is the customer's axis (borrador / enviada /
autorizada / rechazada); `estadoInterno` is the shop's own axis (pendiente → en_proceso →
completada → por_cobrar → cobrada) — two columns on purpose, because "did the customer say yes"
and "did we get paid" are different questions that don't share an answer space. Only a `borrador`
is editable; once sent, the numbers are frozen and a correction is a new cotización.

`estadoInterno` cannot move past `pendiente` before the customer has authorized — enforced in the
database by `cotizacion_interno_requiere_autorizacion_check`, not only in application code.
`por_cobrar` requires SOMETHING billed against the quote first (a factura or an active nota de
venta — see `cobranzaDe`); `cobrada` is never set by a button, it falls out of the arithmetic over
payments (`sincronizarCobranza`).

### Nota de venta — cash sale, no IVA

A customer who doesn't need a CFDI pays the cotización's **subtotal**, no tax. Its own model
(`nota_venta`), not an unstamped `factura`: a `factura.iva` always represents a real tax figure in
progress, never zero by convention, so a document that will never carry tax needs its own home.

State machine: `activa → cancelada`, or `activa → facturada` (reached only through
`facturarNotaVenta`, never a generic transition — same reasoning as `factura.pagada` never being a
button). Cancelling is refused once any payment exists, same rule as cancelling a factura — that
case is a correction to make before collecting, not after.

Payments against a nota de venta share the SAME `pago` table a factura uses — `pago.facturaId` and
`pago.notaVentaId` are both nullable, and `pago_exactamente_un_destino_check` enforces that exactly
one of them is ever set. One payments table, one place saldo/history logic lives, instead of two
parallel implementations that can drift.

**Promoting to a factura** (`facturarNotaVenta`): IVA is computed fresh on the nota de venta's
subtotal. Every `pago` row already registered is **re-pointed** at the new factura (`notaVentaId`
cleared, `facturaId` set) — the shop already has that cash, so a nota de venta paid in full still
leaves exactly the new IVA portion outstanding on the factura. Nothing is re-collected, nothing is
invented.

### Factura

The fiscal document. `crearFactura` always issues with `estado: "emitida"` and computes IVA at
16% (`IVA` constant) — issuing is a different act from **stamping** (`timbrarFactura` in
[src/lib/server/timbrado.ts](../src/lib/server/timbrado.ts)), which is what actually produces a
folio fiscal (`uuid`) at the SAT. There's a real window where a factura exists here and hasn't been
stamped yet — `timbradaAt` and `emitidaAt` are deliberately different facts.

`factura.estado` is `borrador | emitida | pagada | cancelada`. `pagada` is arithmetic — reached
when payments cover the total, never set by hand. Cancelling is refused once payments exist (a
credit note is a different document) and refused outright once stamped (that goes through
`cancelarEnSat` instead, with a SAT motive 01–04).

## Reading "how much did we bill/collect" correctly

Any code that sums revenue across the shop — dashboards, customer balance, cotización
collection status — must count **both** `factura` and `nota_venta`, with one rule to avoid
double-counting: **a `nota_venta` in `facturada` state is excluded**, because its money already
counts through the factura it became (same `pago` rows, re-pointed). Only `activa` (or, for a
snapshot of what's currently owed, non-`cancelada`) nota_venta rows are counted alongside
non-cancelled facturas.

This rule is applied in:

- `resumenDinero` / `cobranzaDe` in `src/lib/server/comercial.ts`
- `src/lib/server/dashboard/resumen.ts`, `ventas.ts`, `rentabilidad.ts`
- `src/lib/server/movimientos.ts` (the home activity feed)

Forgetting this on a new report is the single easiest way to make a real counter sale silently
vanish from "ventas del mes".

## Margen / utilidad

`utilidadDeCotizacion` (Admin-only, gated by `cotizacion:costo`) computes `venta - costo` for a
cotización:

- **venta** = the cotización's own total.
- **costo** = approved `cotizacion_interna` rows (labor/misc not in the catalog) **plus** the real
  FIFO cost of anything actually surtido from inventory for that cotización's conceptos
  (`inventario_movimiento.costoTotal`). A concepto that came from an imported supplier CFDI but was
  never stocked (`entradaId` set, no movement) falls back to the `costoUnitario` captured from that
  CFDI at import time — see `agregarConceptosDesdeCompra` and `cotizacion_concepto.costoUnitario`.
  Never both for the same line: a movement cost, when one exists, always wins.

`margenPorcentaje(venta, costo)` is **margin**, not markup: `(venta - costo) / venta × 100`. Margin
and markup answer different questions on the same two numbers, and confusing them is exactly the
bug the function's own naming exists to prevent. Returns `null` for a zero-or-negative venta rather
than a number that reads as real but isn't.

## Crédito

`condicionPago` is `contado | credito`; only `credito` consumes a customer's credit limit
(`esCredito`). `asegurarCredito` checks the limit **inside** the write transaction, so two credit
sales issued at the same instant can't both slip under the same headroom. Going over the limit is
refused with the overage named in the error; forcing it through requires a motive and is its own
audit entry (`cliente.credito_override`). A nota de venta never carries credit terms — it's a cash
sale by definition, paid in however many installments, but with no due date and no limit check.
