/**
 * Reminder vocabulary. Safe to import from the browser: data only.
 */

export const RECORDATORIO_TIPOS = {
	proximo_servicio: { label: "Próximo servicio" },
	seguimiento: { label: "Seguimiento" },
	cobro: { label: "Cobro" },
	otro: { label: "Otro" },
} as const satisfies Record<string, { label: string }>;

export type RecordatorioTipo = keyof typeof RECORDATORIO_TIPOS;
export const RECORDATORIO_TIPO_KEYS = Object.keys(RECORDATORIO_TIPOS) as RecordatorioTipo[];
export const RECORDATORIO_TIPO_DEFAULT: RecordatorioTipo = "otro";
export const isRecordatorioTipo = (v: unknown): v is RecordatorioTipo =>
	typeof v === "string" && Object.hasOwn(RECORDATORIO_TIPOS, v);
export const recordatorioTipoLabel = (v: string) => (isRecordatorioTipo(v) ? RECORDATORIO_TIPOS[v].label : v);
