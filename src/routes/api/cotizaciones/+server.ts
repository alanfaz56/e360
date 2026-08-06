import { json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";
import { listCotizaciones } from "$lib/server/comercial";

/**
 * GET /api/cotizaciones — quotes across every job. Permission: `cotizacion:read`.
 * Params: notaId, estado (customer's answer), estadoInterno (the shop's track), page, perPage.
 *
 * The per-note list already lives at `/api/notas/[id]/cotizaciones`; this is the cross-cutting
 * one — "everything authorised but not yet collected" is a question about the shop, not about a
 * single vehicle, and it cannot be asked one note at a time.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "cotizacion:read");
	return json(
		await listCotizaciones({
			notaId: url.searchParams.get("notaId"),
			estado: url.searchParams.get("estado"),
			estadoInterno: url.searchParams.get("estadoInterno"),
			page: Number(url.searchParams.get("page") ?? 1) || 1,
			perPage: Math.min(Number(url.searchParams.get("perPage") ?? 25) || 25, 100),
		}),
	);
};
