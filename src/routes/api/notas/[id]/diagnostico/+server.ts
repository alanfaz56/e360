import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requireUser } from "$lib/server/guard";
import { capturarDiagnostico, publicNota } from "$lib/server/notas";

/**
 * POST /api/notas/[id]/diagnostico — what the mechanic found, and whether they are done.
 * Permission: `nota:diagnostico`. Body: `{ diagnostico?, terminado? }`.
 *
 * `terminado` is NOT a note estado. "The work is finished" and "the car can be handed over" are two
 * different facts owned by two different people — collapsing them is how a vehicle gets promised
 * to a customer before anybody checked it. Advancing the note stays with the counter.
 *
 * A mechanic may only write to a note assigned to them; anything else answers 404, so probing ids
 * cannot confirm that somebody else's job exists.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

	try {
		const nota = await capturarDiagnostico({
			actor,
			id: params.id!,
			diagnostico: body.diagnostico,
			terminado: body.terminado,
		});
		return json({ nota: publicNota(nota) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
