import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { CitaError, confirmarCita, publicCita } from "$lib/server/citas";

/**
 * POST /api/citas/[id]/confirmar — grant a requested appointment a real hour.
 * Body: { inicio, fin?, asignadoId? }. Permission: `cita:update` (+ `cita:assign` if assigning).
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cita = await confirmarCita({ actor, id: params.id!, body });
		return json({ cita: publicCita(cita) });
	} catch (err) {
		if (err instanceof CitaError) error(err.status, err.message);
		throw err;
	}
};
