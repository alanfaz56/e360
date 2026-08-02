import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { CitaError, actualizarCita, getCita, publicCita } from "$lib/server/citas";

/** GET /api/citas/[id] — one appointment. Permission: `cita:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "cita:read");
	try {
		return json({ cita: publicCita(await getCita(params.id!)) });
	} catch (err) {
		if (err instanceof CitaError) error(err.status, err.message);
		throw err;
	}
};

/**
 * PATCH /api/citas/[id] — edit or reschedule. Permission: `cita:update`.
 * Only the fields present are changed; omit `inicio` to keep the slot.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cita = await actualizarCita({ actor, id: params.id!, body });
		return json({ cita: publicCita(cita) });
	} catch (err) {
		if (err instanceof CitaError) error(err.status, err.message);
		throw err;
	}
};
