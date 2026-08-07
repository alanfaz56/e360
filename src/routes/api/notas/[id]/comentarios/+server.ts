import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser, requirePermission } from "$lib/server/guard";
import { NotaError, comentarNota, getNotaDetalle } from "$lib/server/notas";

/** GET /api/notas/[id]/comentarios — the thread. Permission: `nota:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "nota:read");
	try {
		const { comentarios } = await getNotaDetalle(params.id!);
		return json({ comentarios });
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};

/**
 * POST /api/notas/[id]/comentarios — add one. Permission: `nota:comment`.
 * Body: { texto, interno? }. `interno` defaults to true: staying inside the shop is the safe
 * default, and sharing with the customer is the deliberate act.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const comentario = await comentarNota({
			actor,
			id: params.id!,
			texto: body.texto,
			interno: body.interno,
			// Ids of evidence already uploaded and registered for THIS note — see
			// POST ../evidencias. Anything belonging to another note, or already stapled to another
			// comment, is silently skipped rather than stolen.
			adjuntos: body.adjuntos,
		});
		return json(
			{
				comentario: {
					id: comentario.id,
					texto: comentario.texto,
					interno: comentario.interno,
					autorEmail: comentario.autorEmail,
					createdAt: comentario.createdAt.toISOString(),
				},
			},
			{ status: 201 },
		);
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
