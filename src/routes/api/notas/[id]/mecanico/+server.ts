import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requireUser } from "$lib/server/guard";
import { asignarMecanico, publicNota } from "$lib/server/notas";

/**
 * POST /api/notas/[id]/mecanico — hand the job to a mechanic. `nota:asignar-mecanico`.
 * Body: `{ mecanicoId }`; null or empty takes it off them.
 *
 * Re-assigning clears `trabajoTerminadoAt`: the new mechanic has not finished anything yet, and
 * inheriting somebody else's "done" is how a car gets handed over unchecked.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

	try {
		const nota = await asignarMecanico({ actor, id: params.id!, mecanicoId: body.mecanicoId });
		return json({ nota: publicNota(nota) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
