import { json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";
import { listMovimientos, parseMovimientoQuery, valorInventario } from "$lib/server/inventario";

/**
 * GET /api/inventario/movimientos — the stock ledger. Permission: `inventario:read`.
 * Params: productoId, notaId, tipo, page, perPage.
 *
 * One row per FIFO layer touched, each with the cost that layer actually charged — which is what
 * makes cost of sale reconstructible instead of an average nobody can defend.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "inventario:read");
	const [movimientos, valor] = await Promise.all([
		listMovimientos(parseMovimientoQuery(url.searchParams)),
		valorInventario(),
	]);
	return json({ ...movimientos, valorInventario: valor });
};
