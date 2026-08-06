import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";
import { NotaError, getNotaDetalle } from "$lib/server/notas";

/**
 * GET /api/notas/[id] — one note with its inventory, evidence, comments and transfers.
 * Permission: `nota:read`.
 *
 * Evidence URLs are derived at read time, not stored: a saved signed URL expires and rots into a
 * broken image.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "nota:read");
	try {
		return json(await getNotaDetalle(params.id!));
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
