import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { getUnidad, listPropietarios } from "$lib/server/unidades";

/**
 * GET /api/unidades/[id]/propietarios — ownership history, newest first.
 * Permission: `unidad:read`.
 *
 * The open period (`hasta: null`, `actual: true`) is the current owner and must always match
 * `unidad.clienteId` — a partial unique index guarantees there is exactly one.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "unidad:read");
	try {
		const unidad = await getUnidad(params.id!);
		return json({ propietarios: await listPropietarios(unidad.id) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
