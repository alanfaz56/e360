import { json, type RequestHandler } from "@sveltejs/kit";
import { hoy, isVista, parseFecha } from "$lib/agenda";
import { requirePermission } from "$lib/server/guard";
import { agenda, resumenAgenda } from "$lib/server/citas";

/**
 * GET /api/agenda?vista=semana|dia&fecha=YYYY-MM-DD — the calendar, already laid out.
 * Permission: `cita:read`.
 *
 * Returns one entry per day with `sinHora` (requests still waiting for an hour) and `bloques`
 * (scheduled appointments carrying their overlap column), so an integrator draws the same grid
 * the panel does without re-deriving the layout. Bad params fall back to this week.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const actor = requirePermission(locals, "cita:read");

	const vistaParam = url.searchParams.get("vista");
	const vista = isVista(vistaParam) ? vistaParam : "semana";
	const fecha = parseFecha(url.searchParams.get("fecha")) ?? hoy();
	// `mias=1` means the caller, resolved server-side. `asignadoId` still works for anyone.
	const asignadoId = url.searchParams.get("mias") === "1" ? actor.id : url.searchParams.get("asignadoId");

	const [datos, resumen] = await Promise.all([agenda(vista, fecha, asignadoId), resumenAgenda()]);
	return json({ ...datos, resumen, asignadoId: asignadoId ?? null });
};
