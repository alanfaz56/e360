import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { CitaError, asignarCita, publicCita } from "$lib/server/citas";

/**
 * POST /api/citas/[id]/asignar — name who handles the pickup, or `null` to clear it.
 * Body: { asignadoId }. Permission: `cita:assign`.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cita = await asignarCita({ actor, id: params.id!, asignadoId: body.asignadoId });
		return json({ cita: publicCita(cita) });
	} catch (err) {
		if (err instanceof CitaError) error(err.status, err.message);
		throw err;
	}
};
