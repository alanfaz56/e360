import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { listCotizacionesInternas } from "$lib/server/comercial";

/**
 * GET /api/cotizaciones-internas — cost estimates across every job. Permission:
 * `cotizacion_interna:read`. Params: notaId, estado, mecanicoId.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const actor = requireUser(locals);
	try {
		return json({
			cotizacionesInternas: await listCotizacionesInternas(actor, {
				notaId: url.searchParams.get("notaId"),
				estado: url.searchParams.get("estado"),
				mecanicoId: url.searchParams.get("mecanicoId"),
			}),
		});
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
