import type { ServerLoad } from "@sveltejs/kit";
import {
	COTIZACION_ESTADOS,
	COTIZACION_ESTADO_KEYS,
	COTIZACION_INTERNOS,
	COTIZACION_INTERNO_KEYS,
} from "$lib/comercial";
import { requirePermission } from "$lib/server/guard";
import { listCotizaciones } from "$lib/server/comercial";

/**
 * Every quote in the shop, filterable by BOTH axes.
 *
 * This is the question a single note cannot answer: "what did the customer approve that we still
 * have not collected" is about the shop, not about one vehicle, and asking it one note at a time is
 * not asking it at all. Same shared function the `/api/cotizaciones` route calls (Rule 4).
 */
export const load: ServerLoad = async ({ locals, url }) => {
	requirePermission(locals, "cotizacion:read");

	const estado = url.searchParams.get("estado") ?? "";
	const estadoInterno = url.searchParams.get("estadoInterno") ?? "";

	return {
		...(await listCotizaciones({
			estado,
			estadoInterno,
			page: Number(url.searchParams.get("page") ?? 1) || 1,
			perPage: 25,
		})),
		filtros: { estado, estadoInterno },
		estados: COTIZACION_ESTADO_KEYS.map((k) => ({ value: k, label: COTIZACION_ESTADOS[k].label })),
		internos: COTIZACION_INTERNO_KEYS.map((k) => ({ value: k, label: COTIZACION_INTERNOS[k].label })),
	};
};
