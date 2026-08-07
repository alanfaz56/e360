/**
 * Inventory vocabulary. Browser-safe: data and pure functions only.
 *
 * Stock is **FIFO by layer**, not by average cost. Ten filters bought at $80 and ten more at $95
 * are not twenty filters at $87.50 — the next one out costs $80 until the first ten are gone, and
 * a margin computed any other way is fiction the moment prices move.
 */

type Tone = "neutral" | "ok" | "warn" | "danger" | "brand";

export const MOVIMIENTO_TIPOS = {
	entrada: { label: "Entrada", descripcion: "Llegó mercancía", tone: "ok" },
	salida: { label: "Salida", descripcion: "Se usó en un trabajo", tone: "brand" },
	ajuste: { label: "Ajuste", descripcion: "Corrección de existencia; siempre lleva motivo", tone: "warn" },
} as const satisfies Record<string, { label: string; descripcion: string; tone: Tone }>;

export type MovimientoTipo = keyof typeof MOVIMIENTO_TIPOS;
export const MOVIMIENTO_TIPO_KEYS = Object.keys(MOVIMIENTO_TIPOS) as MovimientoTipo[];
export const isMovimientoTipo = (v: unknown): v is MovimientoTipo =>
	typeof v === "string" && Object.hasOwn(MOVIMIENTO_TIPOS, v);
export const movimientoTipoLabel = (v: string) => (isMovimientoTipo(v) ? MOVIMIENTO_TIPOS[v].label : v);

export const SOLICITUD_ESTADOS = {
	pendiente: { label: "Pendiente", tone: "warn" },
	surtida: { label: "Surtida", tone: "ok" },
	rechazada: { label: "No disponible", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export type SolicitudEstado = keyof typeof SOLICITUD_ESTADOS;
export const isSolicitudEstado = (v: unknown): v is SolicitudEstado =>
	typeof v === "string" && Object.hasOwn(SOLICITUD_ESTADOS, v);
export const solicitudEstadoLabel = (v: string) => (isSolicitudEstado(v) ? SOLICITUD_ESTADOS[v].label : v);
export const solicitudEstadoTone = (v: string): Tone => (isSolicitudEstado(v) ? SOLICITUD_ESTADOS[v].tone : "neutral");

/**
 * Quantities are Decimal(12,3): 0.75 litres of oil is a real issue, and rounding it to whole
 * units either gives stock away or invents it.
 *
 * Parsed from a string, never from a float — same rule as `centavos()` for money, and it refuses
 * anything ambiguous rather than guessing.
 */
export function cantidad(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
	if (typeof value !== "string") return null;
	const limpio = value.trim().replace(/,/g, "");
	if (limpio === "" || !/^\d+(\.\d{1,3})?$/.test(limpio)) return null;
	const n = Number(limpio);
	return Number.isFinite(n) ? n : null;
}

/** Three decimals, always — so a quantity never renders as "2" one place and "2.000" in another. */
export const formatoCantidad = (n: number | string): string =>
	Number(n)
		.toFixed(3)
		.replace(/\.?0+$/, "");

/** Below the reorder point, or out entirely. Drives the "hay que comprar" list. */
export function estadoExistencia(
	existencia: number,
	minimo: number | null,
): {
	label: string;
	tone: Tone;
} {
	if (existencia <= 0) return { label: "Agotado", tone: "danger" };
	if (minimo !== null && existencia <= minimo) return { label: "Bajo mínimo", tone: "warn" };
	return { label: "Disponible", tone: "ok" };
}
