import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { vincularCotizacionInterna } from "$lib/server/comercial";

/**
 * POST /api/cotizaciones-internas/[id]/vincular — link (or unlink, `cotizacionId: null`) an
 * estimate to a customer-facing cotización of the same nota. Permission: `cotizacion_interna:create`.
 *
 * Deliberately optional at creation: whoever types this in from a WhatsApp message often does not
 * yet know which quote it belongs to.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

	try {
		return json({
			cotizacionInterna: await vincularCotizacionInterna({
				actor,
				id: params.id!,
				cotizacionId: body.cotizacionId ? String(body.cotizacionId) : null,
			}),
		});
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
