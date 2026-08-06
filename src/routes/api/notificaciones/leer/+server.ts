import { json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { contarNoLeidas, marcarLeidas } from "$lib/server/notificaciones";

/**
 * POST /api/notificaciones/leer — mark read. Body `{ ids?: string[] }`; no ids means all.
 *
 * A POST rather than a PATCH per id: "mark all as read" is one action the user takes, and doing it
 * as N requests is how a phone on shop wifi ends up with half its inbox still bold.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = ((await request.json().catch(() => null)) ?? {}) as { ids?: unknown };
	const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string") : undefined;

	const marcadas = await marcarLeidas(actor, ids);
	return json({ marcadas, noLeidas: await contarNoLeidas(actor.id) });
};
