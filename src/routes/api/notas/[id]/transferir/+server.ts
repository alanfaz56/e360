import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { NotaError, publicNota, transferirNota } from "$lib/server/notas";

/**
 * POST /api/notas/[id]/transferir — send the vehicle to a partner workshop.
 * Body: { tallerId, motivo }. Permission: `nota:transfer`.
 *
 * Opens a transfer period and points the note at that shop in one transaction. A partial unique
 * index guarantees at most one open transfer per note, so a vehicle is never at two shops at once.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const nota = await transferirNota({
			actor,
			id: params.id!,
			tallerId: body.tallerId,
			motivo: body.motivo,
		});
		return json({ nota: publicNota(nota) });
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
