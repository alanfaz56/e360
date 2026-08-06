import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { NotaError, firmarEvidencia } from "$lib/server/notas";

/**
 * POST /api/notas/[id]/evidencias/firma — a short-lived URL to PUT one file straight to R2.
 * Body: { nombre, contentType, bytes? }. Permission: `nota:inspect`.
 *
 * Two-step upload on purpose: the browser sends the file to R2 directly, so photos never pass
 * through the server and never hit a serverless body limit. Step two is POST ../evidencias with
 * the returned `clave`.
 *
 * The key is generated server-side; a caller-chosen one could overwrite another note's evidence.
 * Returns 503 when R2 is not configured — it fails closed rather than pretending to store things.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const firma = await firmarEvidencia({
			actor,
			id: params.id!,
			nombre: body.nombre,
			contentType: body.contentType,
			bytes: body.bytes,
		});
		return json(firma);
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
