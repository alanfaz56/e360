import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { cancelarNotaVenta, getNotaVenta, publicNotaVenta } from "$lib/server/comercial";

/** GET /api/notas-venta/[id] — with its payments and outstanding balance. `nota_venta:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "nota_venta:read");
	try {
		return json({ notaVenta: publicNotaVenta(await getNotaVenta(params.id!)) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * DELETE /api/notas-venta/[id] — cancel, with a reason. Permission: `nota_venta:cancel`.
 * Refused once payments exist, same reasoning as cancelling a factura.
 */
export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const notaVenta = await cancelarNotaVenta({ actor, id: params.id!, motivo: body.motivo });
		return json({ notaVenta: publicNotaVenta(notaVenta) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
