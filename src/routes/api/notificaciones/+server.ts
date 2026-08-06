import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requireUser } from "$lib/server/guard";
import {
	enviarAviso,
	listarNotificaciones,
	parseNotificacionQuery,
} from "$lib/server/notificaciones";

/**
 * GET /api/notificaciones — YOUR inbox. Params: noLeidas=1, page, perPage.
 *
 * No permission key: reading your own messages is inherent to having an account, and the query is
 * scoped to `actor.id` server-side. There is deliberately no way to read somebody else's inbox —
 * oversight is what the audit trail is for.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const actor = requireUser(locals);
	return json(await listarNotificaciones(actor, parseNotificacionQuery(url.searchParams)));
};

/**
 * POST /api/notificaciones — send a message by hand. Permission: `notificacion:send`.
 * Body: `{ userId | clienteId, titulo, cuerpo, url? }`. `url` must be an internal path.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json(await enviarAviso({ actor, body }), { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
