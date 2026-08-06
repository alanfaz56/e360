import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requireUser } from "$lib/server/guard";
import { guardarPreferencias, preferencias } from "$lib/server/notificaciones";

/** GET /api/notificaciones/preferencias — your per-event switches, with their defaults applied. */
export const GET: RequestHandler = async ({ locals }) => {
	const actor = requireUser(locals);
	return json({ preferencias: await preferencias(actor.id) });
};

/**
 * PUT /api/notificaciones/preferencias — body `{ [evento]: { enApp?, push? } }`.
 * Events not named are left alone, so a partial update never resets the rest.
 */
export const PUT: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const cambios = ((await request.json().catch(() => null)) ?? {}) as Record<
		string,
		{ enApp?: boolean; push?: boolean }
	>;

	try {
		return json({ preferencias: await guardarPreferencias({ actor, cambios }) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
