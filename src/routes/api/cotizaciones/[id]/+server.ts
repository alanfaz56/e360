import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { actualizarCotizacion, getCotizacion, publicCotizacion } from "$lib/server/comercial";

/** GET /api/cotizaciones/[id] — Permission: `cotizacion:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "cotizacion:read");
	try {
		return json({ cotizacion: publicCotizacion(await getCotizacion(params.id!)) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * PATCH /api/cotizaciones/[id] — replace the line items. Permission: `cotizacion:create`.
 * Only a `borrador` is editable: once the customer has seen it, changing the numbers underneath
 * them is exactly what the estado machine exists to prevent. Reject it and make a new one.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cotizacion = await actualizarCotizacion({ actor, id: params.id!, body });
		return json({ cotizacion: publicCotizacion(cotizacion) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
