import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requireUser } from "$lib/server/guard";
import { resolverSolicitud } from "$lib/server/inventario";

/**
 * POST /api/inventario/solicitudes/[id] — fill or refuse a mechanic's request.
 * Permission: `inventario:salida`. Body: `{ estado: "surtida" | "rechazada", motivo? }`.
 *
 * Filling it is what ISSUES the stock, in the same transaction — a request can never be marked
 * surtida without the movements that back it. Refusing requires a reason: it is what the mechanic
 * reads to know what to do instead.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

	try {
		const solicitud = await resolverSolicitud({
			actor,
			id: params.id!,
			estado: String(body.estado ?? ""),
			motivo: body.motivo,
		});
		return json({ solicitud });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
