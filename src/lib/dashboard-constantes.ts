/**
 * Thresholds for the manager dashboard (/panel/dashboard) — "atrasado", "antigua", "reciente".
 *
 * One file so every alert/badge reads the same number instead of a magic constant sprinkled
 * across `src/lib/server/dashboard/*`. Safe to import from the browser: data only.
 */

/** Days an open nota_servicio may sit before it counts as "atrasada" — §7/§19. */
export const DIAS_NOTA_ATRASADA = 5;

/** Days a cotización may sit in borrador/enviada before it counts as "antigua sin autorizar" — §19. */
export const DIAS_COTIZACION_ANTIGUA = 3;

/** Window for "garantías recientes" in the alerts panel — §19. */
export const DIAS_GARANTIA_RECIENTE = 30;

/** Days a unit may sit at a taller externo before its time-out counts as long — §12. */
export const DIAS_TRANSFERENCIA_LARGA = 10;

export const RANGO_OPCIONES = [
	{ value: "hoy", label: "Hoy" },
	{ value: "semana", label: "Esta semana" },
	{ value: "mes", label: "Este mes" },
	{ value: "30d", label: "Últimos 30 días" },
	{ value: "anio", label: "Este año" },
	{ value: "personalizado", label: "Personalizado" },
] as const satisfies readonly { value: string; label: string }[];

export type RangoValue = (typeof RANGO_OPCIONES)[number]["value"];
export const RANGO_DEFAULT: RangoValue = "30d";
export const isRangoValue = (v: unknown): v is RangoValue =>
	typeof v === "string" && RANGO_OPCIONES.some((r) => r.value === v);
