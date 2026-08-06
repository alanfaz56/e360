import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { NotaError, cancelarNota, publicNota } from "$lib/server/notas";

/**
 * POST /api/notas/[id]/cancelar — cancel, with a reason. Permission: `nota:cancel`.
 * Body: { motivo }. Any open transfer is closed in the same transaction.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json({ nota: publicNota(await cancelarNota({ actor, id: params.id!, motivo: body.motivo })) });
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
