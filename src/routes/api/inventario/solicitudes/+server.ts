import { json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";
import { listSolicitudes } from "$lib/server/inventario";

/**
 * GET /api/inventario/solicitudes — parts mechanics have asked for. `inventario:salida`.
 * Params: notaId, estado.
 *
 * The pending list is also the record of the gap between what jobs needed and what was on the
 * shelf, which is the thing that tells you what to keep in stock.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "inventario:salida");
	return json({
		solicitudes: await listSolicitudes({
			notaId: url.searchParams.get("notaId"),
			estado: url.searchParams.get("estado"),
		}),
	});
};
