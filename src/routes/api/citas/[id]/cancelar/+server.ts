import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { CitaError, cancelarCita, publicCita } from "$lib/server/citas";

/**
 * POST /api/citas/[id]/cancelar — cancel, with a reason.
 * Body: { motivo }. Permission: `cita:cancel`. The reason is stored and audited because it is
 * what gets read back to the customer on the phone.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cita = await cancelarCita({ actor, id: params.id!, motivo: body.motivo });
		return json({ cita: publicCita(cita) });
	} catch (err) {
		if (err instanceof CitaError) error(err.status, err.message);
		throw err;
	}
};
