import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requireUser } from "$lib/server/guard";
import { avanzarInterno } from "$lib/server/comercial";

/**
 * POST /api/cotizaciones/[id]/interno — move a quote along the SHOP's track.
 * Permission: `cotizacion:interno`. Body: `{ estado }`.
 *
 * pendiente → en_proceso → completada → por_cobrar. `cobrada` is NOT accepted here: it is reached
 * by arithmetic over the payments, exactly like `factura.pagada`, and offering it as a destination
 * would be a button that lies about money.
 *
 * Nothing leaves `pendiente` until the customer has authorized — refused here and again by
 * `cotizacion_interno_requiere_autorizacion_check`.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

	try {
		return json({ cotizacion: await avanzarInterno({ actor, id: params.id!, estado: body.estado }) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
