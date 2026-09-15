/**
 * Gastos generales — shop overhead not tied to any one job (electricidad, agua, nómina, renta).
 * Browser-safe: data + pure functions only, mirrors the comercial.ts / server/comercial.ts split.
 */

export const GASTO_ESTADOS = ["pendiente", "confirmado"] as const;
export type GastoEstado = (typeof GASTO_ESTADOS)[number];

export const GASTO_ESTADO_LABEL: Record<GastoEstado, string> = {
	pendiente: "Pendiente de confirmar",
	confirmado: "Confirmado",
};

export const isGastoEstado = (v: unknown): v is GastoEstado =>
	typeof v === "string" && (GASTO_ESTADOS as readonly string[]).includes(v);
