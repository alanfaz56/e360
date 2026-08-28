import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { crearNotaVenta, publicNotaVenta } from "$lib/server/comercial";

/**
 * POST /api/notas-venta — cash sale, no IVA, from an authorized quote or explicit line items.
 * Permission: `nota_venta:create`.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const notaVenta = await crearNotaVenta({ actor, body });
		return json({ notaVenta: publicNotaVenta(notaVenta) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
