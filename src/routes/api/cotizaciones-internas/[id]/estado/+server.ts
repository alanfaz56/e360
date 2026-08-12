import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { resolverCotizacionInterna } from "$lib/server/comercial";

/**
 * POST /api/cotizaciones-internas/[id]/estado — approve or reject. Permission:
 * `cotizacion_interna:authorize`. Body: `{ estado: "aprobada" | "rechazada", motivo? }`.
 * `motivo` is mandatory on a rejection — it is what stays on the record.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

	try {
		return json({
			cotizacionInterna: await resolverCotizacionInterna({
				actor,
				id: params.id!,
				estado: body.estado,
				motivo: body.motivo,
			}),
		});
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
