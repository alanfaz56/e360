# Dinero — cotización, nota de venta, factura, crédito

Domain code: [src/lib/comercial.ts](../src/lib/comercial.ts) (browser-safe vocabulary, state
machines, money helpers) and [src/lib/server/comercial.ts](../src/lib/server/comercial.ts)
(everything that touches the database).

## Concurrency

Every money write that depends on a figure it just read re-checks that figure **inside** its
transaction, because the first read happens before the transaction opens and two clicks can pass it
at once:

- `registrarPago` / `registrarPagoNotaVenta` recompute the saldo inside the transaction — the
  pre-flight check above them only exists to give a good error message. `pago_monto_check` guards
  one row's amount, never the running total, so overpayment has to be caught here.
- `cancelarFactura` / `cancelarNotaVenta` re-count payments inside, and carry the state they read
  in the `updateMany` `where` — a cancel that races a payment loses instead of burying it.
- `facturarNotaVenta` claims the nota de venta (`activa → facturada`) as the FIRST statement in the
  transaction, before creating anything: two calls would otherwise both create a factura and
  re-point the same `pago` rows twice.
- `cambiarEstadoCotizacion` carries the starting `estado` in its `updateMany` `where`, so two tabs
  cannot authorize and reject the same quote at once. For the `autorizada → rechazada` override it
  also re-counts the downstream factura / nota de venta **inside** the transaction: one created
  while the rejection was in flight would otherwise be left hanging off a rejected quote.
- `crearFactura` refuses a cotización that already has an `activa` nota de venta (the mirror of the
  check `crearNotaVenta` already made in the other direction) — that case is `facturarNotaVenta`,
  which promotes the existing document and keeps its payments, not a second document for the same
  work. The partial unique indexes are per-table and cannot express this cross-table rule.
- One cotización can carry at most one non-cancelled factura and one non-cancelled nota de venta —
  enforced by the partial unique indexes `factura_cotizacion_unica_activa` and
  `nota_venta_cotizacion_unica_activa`, so no code path can double-bill regardless of timing.

## Money representation

**Never floats.** Every amount is a `Decimal(12,2)` column and a string in the API, but every
calculation happens in **integer cents as a `bigint`** — `centavos()` parses a string into cents,
`pesos()` turns cents back into the "1234.50" string the API and the database use, `dec()` (server
only) wraps cents back into a `Prisma.Decimal` for a write. A peso that drifts by a cent because of
binary floating point is a peso somebody argues about at the counter, so nothing here ever holds an
amount as a JS `number`.

`aCentavos()` (server) reads a money column as cents through `Decimal.toFixed(2)`, not
`toString()`: the cost columns are `Decimal(12,4)`, `centavos()` rejects more than two decimals, and
a real supplier cost of `150.755` used to parse as `null` and fall back to `0n` — a line that
silently cost nothing and an overstated utilidad. `Decimal.toFixed` rounds in exact decimal;
`Number.toFixed` would drag the binary representation (`150.755 → "150.75"`), which is the cent this
project does not leave to a float.

`totales()` computes IVA on the **rounded subtotal**, never per line — that's how a CFDI is
expected to add up, and it's what keeps an invoice's total agreeing with the sum of its own lines.

## Precio con IVA incluido (por línea)

A cotización line can be typed as a tax-INCLUDED price (`incluyeIva` on `cotizacion_concepto`) —
useful when a supplier or a customer conversation only ever gives you the "con IVA" number.
Normalization happens ONCE, at write time, in `src/lib/server/comercial.ts`'s `conImportes`: the
typed price is backed out to its tax-exclusive equivalent (`importeConceptoInclusivo`,
`src/lib/comercial.ts` — ×100/116, rounded once on the whole line total, never on the unit price
and the line total separately) and THAT is what lands in `precioUnitario`/`importe` — the columns
hold a tax-exclusive amount for every line, always, no exceptions.

`totales()` never learns about `incluyeIva`: it only ever sees already-exclusive importes, which is
why the "IVA once, on the aggregate" rule above holds unchanged. The flag survives only for
redisplay (`precioInclusivoDeExclusivo` adds the IVA back for the UI when a `borrador` is
reopened) — it carries no further downstream, and `factura_concepto`/`nota_venta_concepto` don't
have the column at all: by the time either document copies a cotización's lines, normalization
already happened, and a factura computes its own IVA on the aggregate the same way it always has.

A cotización that becomes a nota de venta (no IVA, ever) charges the BACKED-OUT amount for that
line, not the originally typed one — consistent with `importe` meaning "the amount" everywhere
downstream of normalization, with no special-casing at any read site.

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

`autorizada → rechazada` is also reachable, but only as a staff override (`cotizacion:reject-
authorized`, Admin/Gerente), separate from the customer recording their own answer
(`cotizacion:authorize`) — reversing an approval already made, not registering a new one. Audited
under its own action, `cotizacion.reject-authorized`, so it reads distinctly from an
`enviada → rechazada` in the history. Blocked once a non-cancelled factura or nota de venta already
references the cotización — that document has to be cancelled on its own terms first, this
transition never unlinks one out from under it.

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

## Gastos generales

Shop overhead not tied to any one job — electricidad, agua, nómina, renta. Domain code:
[src/lib/gastos.ts](../src/lib/gastos.ts) (vocabulary) and
[src/lib/server/gastos.ts](../src/lib/server/gastos.ts) (everything that touches the database),
same split as the rest of this document. Gated by `gasto:read` / `gasto:create` / `gasto:manage`
(Admin/Gerente — see `src/lib/roles.ts`).

Deliberately **not** an extension of `cotizacion_interna` or `inventario_movimiento`: both of
those are scoped to a specific `nota_servicio` by design (their entire reason for existing is
per-job margin), and overhead is not attributable to one job.

**Estado**: a `gasto` is `pendiente` or `confirmado`. Only `confirmado` counts toward utilidad —
see below. A `pendiente` row is a draft generated from a `gasto_plantilla` and is not yet a real
gasto until a human reviews and confirms it (`confirmarGastoPendiente`).

**Plantillas** (`gasto_plantilla`) are recurring definitions — categoría, monto por default, día
del mes. `asegurarDraftsDelPeriodo` lazily creates one `pendiente` draft per active plantilla per
calendar month, called from `/panel/gastos`'s `load` — **no cron job**. Idempotency relies on the
`@@unique([plantillaId, fecha])` constraint as the backstop against a duplicate draft from a
concurrent load, catching the unique-violation the same way `registrarPago`'s in-transaction
re-check handles a race (see Concurrency, above) — this one just doesn't need a transaction
because a duplicate draft is caught by the constraint itself, not read-then-write.

**Utilidad antes / después de gastos**: `src/lib/server/dashboard/resumen.ts`'s `bloqueDinero`
computes `utilidadAntesDeGastos = ventas − costo` (what the jobs themselves left) and
`utilidad = utilidadAntesDeGastos − gastos` (net, after overhead), where `gastos` is
`totalGastosPeriodo` — the ONE function that sums `confirmado`, non-archived gastos for a period
(same "count once, in one place" rule as "Reading how much did we bill/collect correctly", above).
Both are **shop-wide figures only**; the dashboard's Resumen KPIs show both side by side so a
period heavy on one-off overhead (rent, a big repair) doesn't read as the jobs themselves losing
money. Per-job `rentabilidad.ts` and the trend series in `ventas.ts` are deliberately untouched:
overhead isn't attributable to one nota_servicio, so it never enters a per-job margin calculation.

## Crédito

`condicionPago` is `contado | credito`; only `credito` consumes a customer's credit limit
(`esCredito`). `asegurarCredito` checks the limit **inside** the write transaction, and takes a
`SELECT ... FOR UPDATE` on the customer row first, so two credit sales issued at the same instant
can't both slip under the same headroom — reading inside the transaction is not enough on its own,
because under READ COMMITTED both would still see the balance from before the other's write. Going over the limit is
refused with the overage named in the error; forcing it through requires a motive and is its own
audit entry (`cliente.credito_override`). A nota de venta never carries credit terms — it's a cash
sale by definition, paid in however many installments, but with no due date and no limit check.
