import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requirePermission, requireUser } from "$lib/server/guard";
import { crearProducto, listProductos, parseProductoQuery, publicProducto } from "$lib/server/productos";

/**
 * GET /api/productos — the catalogue. Permission: `producto:read`.
 * Params: q, tipo, bajos=1 (at or below reorder point), archivados=1, page, perPage.
 *
 * Carries the SAT keys (`claveProdServ`, `claveUnidad`) from day one even though nothing is
 * stamped yet — an integrator building CFDI on top of this needs them, and backfilling them later
 * means guessing what every past line should have been.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "producto:read");
	return json(await listProductos(parseProductoQuery(url.searchParams)));
};

/** POST /api/productos — Permission: `producto:manage`. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json({ producto: publicProducto(await crearProducto({ actor, body })) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
