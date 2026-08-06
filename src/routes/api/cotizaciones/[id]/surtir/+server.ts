import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requireUser } from "$lib/server/guard";
import { surtirCotizacion } from "$lib/server/comercial";

/**
 * POST /api/cotizaciones/[id]/surtir — issue the parts this quote calls for, FIFO.
 * Permission: `inventario:salida`.
 *
 * Only catalogue lines that carry stock are touched; labour and sublet work have nothing to issue.
 * Lines already supplied are skipped — the guard is `cantidad - surtido` read off the row, so
 * calling this twice cannot double-consume.
 *
 * All or nothing: if one part is short the whole thing rolls back, because half a job's parts
 * leaving the shelf without anybody being told is worse than a clear refusal.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
	const actor = requireUser(locals);

	try {
		return json(await surtirCotizacion({ actor, id: params.id! }));
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
