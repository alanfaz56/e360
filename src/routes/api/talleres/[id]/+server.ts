import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { getTallerDetalle, publicTaller, setTallerArchivado, updateTaller } from "$lib/server/talleres";
import { ClienteError } from "$lib/server/clientes";

/** GET /api/talleres/[id] — the workshop with its branches. Permission: `taller:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "taller:read");
	try {
		return json({ taller: await getTallerDetalle(params.id!) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/** PATCH /api/talleres/[id] — Permission: `taller:manage`. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json({ taller: publicTaller(await updateTaller({ actor, id: params.id!, body })) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * DELETE /api/talleres/[id] — archives, never deletes. Permission: `taller:manage`.
 * A shop that has held vehicles is part of the service history; the FK is `Restrict` so that
 * history cannot vanish. Refused while it still holds a unit.
 */
export const DELETE: RequestHandler = async ({ locals, params, url }) => {
	const actor = requireUser(locals);
	const archivado = url.searchParams.get("archivado") !== "0";

	try {
		const taller = await setTallerArchivado({ actor, id: params.id!, archivado });
		return json({ taller: publicTaller(taller) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
