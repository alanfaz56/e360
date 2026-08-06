import type { ServerLoad } from "@sveltejs/kit";
import { CITA_ESTADOS, CITA_ESTADO_KEYS, CITA_TIPOS, CITA_TIPO_KEYS } from "$lib/citas";
import { can } from "$lib/roles";
import { listCitas, parseCitaQuery } from "$lib/server/citas";
import { requirePermission } from "$lib/server/guard";

/**
 * The full appointment list: requests and booked appointments together, newest day first.
 * Same shared function the API route uses (Rule 4) — the filters are the API's query params.
 */
export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requirePermission(locals, "cita:read");
	const query = parseCitaQuery(url.searchParams, actor.id);
	const mias = url.searchParams.get("mias") === "1";

	return {
		...(await listCitas(query)),
		mias,
		vencidas: query.vencidas ?? false,
		filtros: {
			q: query.q ?? "",
			estado: query.estado ?? "",
			tipo: query.tipo ?? "",
			desde: query.desde ?? "",
			hasta: query.hasta ?? "",
		},
		estados: CITA_ESTADO_KEYS.map((k) => ({ value: k, label: CITA_ESTADOS[k].label })),
		tipos: CITA_TIPO_KEYS.map((k) => ({ value: k, label: CITA_TIPOS[k].label })),
		puede: { crear: can(actor.role, "cita:create") },
	};
};
