import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requireUser } from "$lib/server/guard";
import { archivarSucursal, updateSucursal } from "$lib/server/talleres";

/** PATCH /api/sucursales/[id] — edit a branch or its contact person. `taller:manage`. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json({ sucursal: await updateSucursal({ actor, id: params.id!, body }) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * DELETE /api/sucursales/[id] — archives, never deletes. `taller:manage`.
 * `?archivado=0` reactivates. A branch that held a vehicle is part of where that vehicle has been.
 */
export const DELETE: RequestHandler = async ({ locals, params, url }) => {
	const actor = requireUser(locals);
	const archivado = url.searchParams.get("archivado") !== "0";

	try {
		return json({ sucursal: await archivarSucursal({ actor, id: params.id!, archivado }) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
