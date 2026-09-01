import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { NotaError, mejorarComentarioIA } from "$lib/server/notas";

// Calls an external LLM (up to 45s internally, see src/lib/server/ia) — raises this route's
// ceiling on Vercel so that call isn't cut short, same as the `reporteIA` page action.
export const config = { maxDuration: 60 };

/**
 * POST /api/notas/[id]/comentarios/mejorar — rewrite a draft comment with AI.
 * Body: { texto }. Permission: `nota:comment` (same as posting the comment itself — this only
 * rewrites text the caller could already submit as-is). Returns the rewritten text; nothing is
 * saved here, the human still has to review it and submit the comment form themselves.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const { texto } = await mejorarComentarioIA({ actor, id: params.id!, texto: body.texto });
		return json({ texto });
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
