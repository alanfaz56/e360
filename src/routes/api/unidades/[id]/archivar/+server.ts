import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { publicUnidad, setUnidadArchivada } from "$lib/server/unidades";

/**
 * POST /api/unidades/:id/archivar — archive or restore. Permission: `unidad:archive`.
 * Body: { archivado: boolean }
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	if (typeof body.archivado !== "boolean") error(400, "Se requiere `archivado` booleano");

	try {
		const unidad = await setUnidadArchivada({ actor, id: params.id!, archivado: body.archivado });
		return json({ unidad: publicUnidad(unidad) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
