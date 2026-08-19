/**
 * The period the manager dashboard reads, and how to compare it against "the same stretch,
 * right before it".
 *
 * One resolver so every dashboard module filters the same window from the same querystring, and
 * one comparison function so "vs. periodo anterior" is computed identically everywhere instead of
 * once per module — including the sign flip for a metric where LESS is the good direction
 * (tiempo de reparación, cuentas vencidas, garantías — PRD §4).
 */
import { diasEntre, enZona, hoy, parseFecha, sumarDias } from "$lib/agenda";
import { isRangoValue, RANGO_DEFAULT, type RangoValue } from "$lib/dashboard-constantes";

export type Periodo = { desde: string; hasta: string; rango: RangoValue };

/** Monday of `fecha`'s calendar week, shop-local. Exported: `ventas.ts` buckets by week the same way. */
export function lunesDe(fecha: string): string {
	const dow = enZona(fecha, "12:00").getUTCDay(); // 0=domingo..6=sábado
	const desdeLunes = dow === 0 ? 6 : dow - 1;
	return sumarDias(fecha, -desdeLunes);
}

/** Resolve `{desde, hasta}` from the filter querystring's `rango` (+ `desde`/`hasta` for `personalizado`). */
export function resolverPeriodo(params: URLSearchParams): Periodo {
	const rangoParam = params.get("rango");
	const rango: RangoValue = isRangoValue(rangoParam) ? rangoParam : RANGO_DEFAULT;
	const hoyStr = hoy();

	if (rango === "personalizado") {
		const desde = parseFecha(params.get("desde")) ?? sumarDias(hoyStr, -29);
		const hasta = parseFecha(params.get("hasta")) ?? hoyStr;
		// A backwards range reads as nonsense everywhere downstream (negative day counts) —
		// swap rather than reject, so a form filled out of order still shows something.
		return desde <= hasta ? { desde, hasta, rango } : { desde: hasta, hasta: desde, rango };
	}
	if (rango === "hoy") return { desde: hoyStr, hasta: hoyStr, rango };
	if (rango === "semana") return { desde: lunesDe(hoyStr), hasta: hoyStr, rango };
	if (rango === "mes") return { desde: `${hoyStr.slice(0, 7)}-01`, hasta: hoyStr, rango };
	if (rango === "anio") return { desde: `${hoyStr.slice(0, 4)}-01-01`, hasta: hoyStr, rango };
	return { desde: sumarDias(hoyStr, -29), hasta: hoyStr, rango }; // 30d
}

/** The immediately-preceding period of equal length — e.g. this Mon–today vs. last Mon–Sun-equivalent. */
export function periodoAnterior(p: Periodo): { desde: string; hasta: string } {
	const dias = diasEntre(p.desde, p.hasta) + 1; // inclusive day count
	const hasta = sumarDias(p.desde, -1);
	const desde = sumarDias(hasta, -(dias - 1));
	return { desde, hasta };
}

/**
 * % change from `anterior` to `actual`, plus whether that change is an IMPROVEMENT.
 *
 * `pct` is always signed by the raw direction of change (up is positive) — the reader still needs
 * to know "ventas subieron 12%" regardless of whether up is good. `mejora` is the separate
 * good/bad verdict, inverted for `menorEsMejor` metrics. Both null when `anterior` is 0: there is
 * no "percent of nothing", and a 0-base division reads as a real number but isn't (Rule 10).
 */
export function variacion(
	actual: number,
	anterior: number,
	menorEsMejor = false,
): { pct: number | null; mejora: boolean | null } {
	if (actual === anterior) return { pct: 0, mejora: null };
	const subio = actual > anterior;
	const mejora = menorEsMejor ? !subio : subio;
	if (anterior === 0) return { pct: null, mejora };
	const pct = Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
	return { pct, mejora };
}
