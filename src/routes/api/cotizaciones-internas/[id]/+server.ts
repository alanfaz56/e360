import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { actualizarCotizacionInterna, getCotizacionInterna, publicCotizacionInterna } from "$lib/server/comercial";

/** GET /api/cotizaciones-internas/[id] — Permission: `cotizacion_interna:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const actor = requireUser(locals);
	try {
		return json({ cotizacionInterna: publicCotizacionInterna(await getCotizacionInterna(actor, params.id!)) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * PATCH /api/cotizaciones-internas/[id] — replace the line items. Permission:
 * `cotizacion_interna:create`. Only while `pendiente`: once resolved, submit a new estimate.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json({ cotizacionInterna: await actualizarCotizacionInterna({ actor, id: params.id!, body }) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
