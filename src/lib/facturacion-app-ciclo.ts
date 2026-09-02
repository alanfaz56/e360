/**
 * Pure cycle-status logic behind `src/lib/server/facturacion-app.ts` — split out into its own
 * dependency-free module so it can be unit-tested without a database or SvelteKit's `$env` (same
 * reason `nombre-mencionado.ts` exists next to `server/talleres.ts`).
 */

export function inicioDeMes(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** "2026-09" — the folder/cycle key for whatever month `d` falls in. */
export function claveDeCiclo(d: Date): string {
	return inicioDeMes(d).toISOString().slice(0, 7);
}

export type EstadoCiclo = "al_corriente" | "por_vencer" | "bloqueado";

/**
 * Status for "today", given the latest evidence row's cycle (or none) and today's effective due
 * date (normally the 15th, or an owner-granted extension — see `vencimientoEfectivo`). The warning
 * window always starts 5 days before the effective due date, extended or not.
 */
export function estadoCiclo(hoy: Date, ultimoPagoCiclo: Date | null, vencimiento: Date): EstadoCiclo {
	const cicloActual = inicioDeMes(hoy);
	const pagado = ultimoPagoCiclo !== null && ultimoPagoCiclo.getTime() === cicloActual.getTime();
	if (pagado) return "al_corriente";

	const avisoDesde = new Date(vencimiento);
	avisoDesde.setUTCDate(avisoDesde.getUTCDate() - 5);

	if (hoy.getTime() < avisoDesde.getTime()) return "al_corriente";
	if (hoy.getTime() <= vencimiento.getTime()) return "por_vencer";
	return "bloqueado";
}

/**
 * This month's real due date: the 15th, unless the owner set `facturacion_app.plazo_extendido` to
 * a date that falls WITHIN the current calendar month. A stale extension (left over from a past
 * month) or one set ahead of time for a future month is silently ignored — the override can never
 * stay on by accident, because it's re-validated against "today" every time it's read, the same
 * idea `valorAjuste` already applies to every other setting.
 */
export function vencimientoEfectivo(hoy: Date, plazoExtendidoTexto: string | null): Date {
	const quince = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 15));
	if (!plazoExtendidoTexto) return quince;

	const extendido = new Date(`${plazoExtendidoTexto}T00:00:00Z`);
	if (Number.isNaN(extendido.getTime())) return quince;
	if (inicioDeMes(extendido).getTime() !== inicioDeMes(hoy).getTime()) return quince;
	return extendido;
}

/** "15 de septiembre" — for the warning modal's copy. */
export function vencimientoLabel(d: Date): string {
	return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });
}
