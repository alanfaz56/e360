import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { NotaError, avanzarNota, publicNota } from "$lib/server/notas";

/**
 * POST /api/notas/[id]/estado — move the note along. Permission: `nota:advance`.
 * Body: { estado }.
 *
 * Three destinations are deliberately NOT reachable here, because each needs more than a status:
 * `en_taller` (/transferir, needs a shop and a reason), `entregada` (/entregar, records who
 * collected it) and `cancelada` (/cancelar, needs a reason).
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json({ nota: publicNota(await avanzarNota({ actor, id: params.id!, estado: body.estado })) });
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
