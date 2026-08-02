import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { CitaError, avanzarCita, publicCita } from "$lib/server/citas";

/**
 * POST /api/citas/[id]/estado — move an appointment forward.
 * Body: { estado }. Permission: `cita:advance`, and an Operador may only advance appointments
 * assigned to them. Cancelling is not reachable here — use /cancelar, which requires a reason.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cita = await avanzarCita({ actor, id: params.id!, estado: body.estado });
		return json({ cita: publicCita(cita) });
	} catch (err) {
		if (err instanceof CitaError) error(err.status, err.message);
		throw err;
	}
};
