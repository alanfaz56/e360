/**
 * Money vocabulary: cotizaciones, facturas, pagos and credit terms.
 *
 * Amounts are NEVER floats. Every total here is a string in the API and a `Decimal(12,2)` in the
 * database — a peso that drifts by a cent because of binary floating point is a peso somebody has
 * to argue about at the counter.
 *
 * Safe to import from the browser: data only.
 */

type Tone = "neutral" | "ok" | "warn" | "danger" | "brand";

// --- Cotización ------------------------------------------------------------------------------

export const COTIZACION_ESTADOS = {
	borrador: { label: "Borrador", tone: "neutral", descripcion: "Todavía se está armando" },
	enviada: { label: "Enviada", tone: "warn", descripcion: "El cliente ya la tiene, falta su respuesta" },
	autorizada: { label: "Autorizada", tone: "ok", descripcion: "El cliente aprobó el trabajo" },
	rechazada: { label: "Rechazada", tone: "danger", descripcion: "El cliente no la aprobó" },
	vencida: { label: "Vencida", tone: "neutral", descripcion: "Pasó su vigencia sin respuesta" },
} as const satisfies Record<string, { label: string; tone: Tone; descripcion: string }>;

export type CotizacionEstado = keyof typeof COTIZACION_ESTADOS;
export const COTIZACION_ESTADO_KEYS = Object.keys(COTIZACION_ESTADOS) as CotizacionEstado[];
export const isCotizacionEstado = (v: unknown): v is CotizacionEstado =>
	typeof v === "string" && v in COTIZACION_ESTADOS;
export const cotizacionEstadoLabel = (v: string) =>
	isCotizacionEstado(v) ? COTIZACION_ESTADOS[v].label : v;
export const cotizacionEstadoTone = (v: string): Tone =>
	isCotizacionEstado(v) ? COTIZACION_ESTADOS[v].tone : "neutral";

/**
 * A quote can only be edited while it is a `borrador`. Once the customer has seen it, changing the
 * numbers underneath them is exactly the behaviour this state machine exists to prevent — reject
 * it and make a new one.
 */
export const COTIZACION_TRANSICIONES = {
	borrador: ["enviada", "rechazada"],
	enviada: ["autorizada", "rechazada", "vencida"],
	autorizada: [],
	rechazada: [],
	vencida: [],
} as const satisfies Record<CotizacionEstado, readonly CotizacionEstado[]>;

export function puedeTransicionarCotizacion(desde: string, hasta: string): boolean {
	if (!isCotizacionEstado(desde) || !isCotizacionEstado(hasta)) return false;
	return (COTIZACION_TRANSICIONES[desde] as readonly string[]).includes(hasta);
}

export const CONCEPTO_TIPOS = {
	refaccion: { label: "Refacción" },
	mano_obra: { label: "Mano de obra" },
	insumo: { label: "Insumo" },
	externo: { label: "Servicio externo" },
} as const satisfies Record<string, { label: string }>;

export type ConceptoTipo = keyof typeof CONCEPTO_TIPOS;
export const CONCEPTO_TIPO_KEYS = Object.keys(CONCEPTO_TIPOS) as ConceptoTipo[];
export const isConceptoTipo = (v: unknown): v is ConceptoTipo =>
	typeof v === "string" && v in CONCEPTO_TIPOS;
export const conceptoTipoLabel = (v: string) => (isConceptoTipo(v) ? CONCEPTO_TIPOS[v].label : v);

/** IVA general. A rate, not a constant sprinkled through the code. */
export const IVA = 0.16;

// --- Factura ---------------------------------------------------------------------------------

export const FACTURA_ESTADOS = {
	borrador: { label: "Borrador", tone: "neutral", descripcion: "Todavía no se timbra" },
	emitida: { label: "Emitida", tone: "brand", descripcion: "Ya cuenta como cobrable" },
	pagada: { label: "Pagada", tone: "ok", descripcion: "Saldada por completo" },
	cancelada: { label: "Cancelada", tone: "danger", descripcion: "Anulada" },
} as const satisfies Record<string, { label: string; tone: Tone; descripcion: string }>;

export type FacturaEstado = keyof typeof FACTURA_ESTADOS;
export const FACTURA_ESTADO_KEYS = Object.keys(FACTURA_ESTADOS) as FacturaEstado[];
export const isFacturaEstado = (v: unknown): v is FacturaEstado =>
	typeof v === "string" && v in FACTURA_ESTADOS;
export const facturaEstadoLabel = (v: string) =>
	isFacturaEstado(v) ? FACTURA_ESTADOS[v].label : v;
export const facturaEstadoTone = (v: string): Tone =>
	isFacturaEstado(v) ? FACTURA_ESTADOS[v].tone : "neutral";

/**
 * `pagada` is NOT set by hand — it is reached by registering payments that cover the total, and
 * left when a payment is reversed. Listing it here anyway would invite a "mark as paid" button
 * that lies about money.
 */
export const FACTURA_TRANSICIONES = {
	borrador: ["emitida", "cancelada"],
	emitida: ["cancelada"],
	pagada: ["cancelada"],
	cancelada: [],
} as const satisfies Record<FacturaEstado, readonly FacturaEstado[]>;

export function puedeTransicionarFactura(desde: string, hasta: string): boolean {
	if (!isFacturaEstado(desde) || !isFacturaEstado(hasta)) return false;
	return (FACTURA_TRANSICIONES[desde] as readonly string[]).includes(hasta);
}

/** How the invoice gets paid. `credito` is the only one that consumes the customer's limit. */
export const CONDICIONES_PAGO = {
	contado: { label: "De contado", credito: false },
	credito: { label: "A crédito", credito: true },
} as const satisfies Record<string, { label: string; credito: boolean }>;

export type CondicionPago = keyof typeof CONDICIONES_PAGO;
export const CONDICION_PAGO_KEYS = Object.keys(CONDICIONES_PAGO) as CondicionPago[];
export const isCondicionPago = (v: unknown): v is CondicionPago =>
	typeof v === "string" && v in CONDICIONES_PAGO;
export const condicionPagoLabel = (v: string) =>
	isCondicionPago(v) ? CONDICIONES_PAGO[v].label : v;
export const esCredito = (v: string) => isCondicionPago(v) && CONDICIONES_PAGO[v].credito;

// --- Pago ------------------------------------------------------------------------------------

export const METODOS_PAGO = {
	efectivo: { label: "Efectivo" },
	tarjeta: { label: "Tarjeta" },
	transferencia: { label: "Transferencia" },
	cheque: { label: "Cheque" },
	otro: { label: "Otro" },
} as const satisfies Record<string, { label: string }>;

export type MetodoPago = keyof typeof METODOS_PAGO;
export const METODO_PAGO_KEYS = Object.keys(METODOS_PAGO) as MetodoPago[];
export const isMetodoPago = (v: unknown): v is MetodoPago =>
	typeof v === "string" && v in METODOS_PAGO;
export const metodoPagoLabel = (v: string) => (isMetodoPago(v) ? METODOS_PAGO[v].label : v);

// --- Money helpers ---------------------------------------------------------------------------

/**
 * Parse an amount into CENTS as a bigint.
 *
 * Money is handled in integer cents everywhere it is added up, and only rendered as pesos. This
 * is the one place a string from a form becomes a number, so it is the one place a rounding rule
 * can live. Rejects negatives, NaN and anything beyond two decimals.
 */
export function centavos(value: unknown): bigint | null {
	if (typeof value === "bigint") return value >= 0n ? value : null;
	const texto = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
	if (!/^\d+(\.\d{1,2})?$/.test(texto)) return null;
	const [enteros, decimales = ""] = texto.split(".");
	return BigInt(enteros) * 100n + BigInt(decimales.padEnd(2, "0"));
}

/** Cents back to the "1234.50" shape the API and Decimal columns use. */
export function pesos(cents: bigint): string {
	const negativo = cents < 0n;
	const abs = negativo ? -cents : cents;
	return `${negativo ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

/** "$1,234.50" for display. Intl, no dependency. */
export function formatoPesos(cents: bigint | string | number): string {
	const valor = typeof cents === "bigint" ? Number(cents) / 100 : Number(cents);
	return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(valor);
}

/**
 * Totals for a set of line items, in cents.
 *
 * IVA is computed on the rounded subtotal rather than per line: that is how the SAT expects a CFDI
 * to add up, and it stops the invoice total from disagreeing with the sum of its own lines by a
 * cent or two.
 */
export function totales(
	conceptos: { cantidad: number; precioUnitario: bigint }[],
	tasaIva = IVA,
): { subtotal: bigint; iva: bigint; total: bigint } {
	const subtotal = conceptos.reduce(
		(suma, c) => suma + importeConcepto(c.cantidad, c.precioUnitario),
		0n,
	);
	const iva = BigInt(Math.round(Number(subtotal) * tasaIva));
	return { subtotal, iva, total: subtotal + iva };
}

/** One line's amount, rounded to the cent. `cantidad` may be fractional (1.5 hours of labour). */
export function importeConcepto(cantidad: number, precioUnitario: bigint): bigint {
	return BigInt(Math.round(Number(precioUnitario) * cantidad));
}
