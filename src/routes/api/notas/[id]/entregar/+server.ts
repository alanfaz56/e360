import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { NotaError, entregarNota, publicNota } from "$lib/server/notas";

/**
 * POST /api/notas/[id]/entregar — hand the vehicle back and close the note.
 * Body: { contactoId?, observaciones? }. Permission: `nota:close`.
 *
 * `contactoId` must be a contact of THIS customer holding `entregador`. A persona may collect
 * their own unit with no contact at all; an organización cannot sign for itself, so it must name
 * somebody.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const nota = await entregarNota({
			actor,
			id: params.id!,
			contactoId: body.contactoId,
			observaciones: body.observaciones,
		});
		return json({ nota: publicNota(nota) });
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
