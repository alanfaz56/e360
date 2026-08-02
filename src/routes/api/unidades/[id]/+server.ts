import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import {
	deleteUnidad,
	getUnidad,
	listPropietarios,
	publicUnidad,
	updateUnidad,
} from "$lib/server/unidades";

/** GET /api/unidades/:id — unit with its ownership history. Permission: `unidad:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "unidad:read");

	try {
		const unidad = await getUnidad(params.id!);
		return json({
			unidad: publicUnidad(unidad),
			propietarios: await listPropietarios(unidad.id),
		});
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/** PATCH /api/unidades/:id — Permission: `unidad:update`. Owner changes go through /transferir. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const unidad = await updateUnidad({ actor, id: params.id!, body });
		return json({ unidad: publicUnidad(unidad) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/** DELETE /api/unidades/:id — permanent, Admin only. Normal path is /archivar. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const actor = requireUser(locals);

	try {
		const unidad = await deleteUnidad({ actor, id: params.id! });
		return json({ deleted: { id: unidad.id } });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
