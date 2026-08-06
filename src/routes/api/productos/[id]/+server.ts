import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requirePermission, requireUser } from "$lib/server/guard";
import { actualizarProducto, archivarProducto, getProducto, publicProducto } from "$lib/server/productos";
import { capasDe } from "$lib/server/inventario";

/**
 * GET /api/productos/[id] — the product plus its OPEN FIFO layers, oldest first.
 *
 * The layers are the answer to "what will the next one out cost me", which a single average cost
 * cannot give. Permission: `producto:read`; the layers additionally need `inventario:read`.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const actor = requirePermission(locals, "producto:read");
	try {
		const producto = await getProducto(params.id!);
		const capas = actor.role && producto.controlaInventario ? await capasDe(producto.id) : [];
		return json({ producto: publicProducto(producto), capas });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/** PATCH /api/productos/[id] — Permission: `producto:manage`. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json({ producto: publicProducto(await actualizarProducto({ actor, id: params.id!, body })) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * DELETE /api/productos/[id] — archives, never deletes. `?archivado=0` reactivates.
 * Refused while there is stock on hand: archiving it would strand the layers.
 */
export const DELETE: RequestHandler = async ({ locals, params, url }) => {
	const actor = requireUser(locals);
	const archivado = url.searchParams.get("archivado") !== "0";

	try {
		return json({ producto: publicProducto(await archivarProducto({ actor, id: params.id!, archivado })) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
