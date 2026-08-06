import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { createTaller, listTalleres, parseTallerQuery, publicTaller } from "$lib/server/talleres";
import { ClienteError } from "$lib/server/clientes";

/**
 * GET /api/talleres — partner workshops. Permission: `taller:read`.
 * Params: q (nombre, contacto, especialidades, ciudad, teléfono), estado, archivados=1, page, perPage.
 *
 * The actor is passed through because `estado` is not a free filter: without `taller:review` the
 * list is the certified registry whatever the query asks for, so an Operador cannot read the
 * application queue by guessing a query string.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const actor = requirePermission(locals, "taller:read");
	return json(await listTalleres(parseTallerQuery(url.searchParams), actor));
};

/** POST /api/talleres — onboard a partner workshop. Permission: `taller:manage`. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json({ taller: publicTaller(await createTaller({ actor, body })) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
