import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { NotaError, borrarEvidencia } from "$lib/server/notas";

/**
 * DELETE /api/notas/[id]/evidencias/[evidenciaId] — Permission: `nota:inspect`.
 * The row goes first; removing the R2 object is best-effort, so storage being unreachable never
 * leaves a phantom attachment in the UI.
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const actor = requireUser(locals);
	try {
		return json(await borrarEvidencia({ actor, id: params.id!, evidenciaId: params.evidenciaId! }));
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
