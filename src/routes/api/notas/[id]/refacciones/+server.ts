import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requirePermission, requireUser } from "$lib/server/guard";
import { listSolicitudes, solicitarRefaccion } from "$lib/server/inventario";

/** GET /api/notas/[id]/refacciones — what has been asked for on this job. `inventario:solicitar`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "inventario:solicitar");
	return json({ solicitudes: await listSolicitudes({ notaId: params.id! }) });
};

/**
 * POST /api/notas/[id]/refacciones — a mechanic asks for a part. `inventario:solicitar`.
 * Body: `{ descripcion, cantidad?, productoId? }`.
 *
 * **Asking is not taking**: this writes no stock movement. Somebody at the counter fills it (which
 * is what issues the stock) or turns it down with a reason. `descripcion` is free text on purpose
 * — a mechanic knows what they need before it has a SKU.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json({ solicitud: await solicitarRefaccion({ actor, notaId: params.id!, body }) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
