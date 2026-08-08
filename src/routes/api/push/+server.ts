import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requireUser } from "$lib/server/guard";
import { borrarSuscripcion, guardarSuscripcion, listarDispositivos } from "$lib/server/notificaciones";
import { clavePublicaVapid } from "$lib/server/push";

/**
 * GET /api/push — the VAPID public key and your registered devices.
 *
 * The public key is public by definition: the browser has to pass it to `pushManager.subscribe`.
 * An empty string means push is not configured, and the UI says so instead of offering a button
 * that cannot work.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const actor = requireUser(locals);
	return json({
		clavePublica: await clavePublicaVapid(),
		dispositivos: await listarDispositivos(actor.id),
	});
};

/**
 * POST /api/push — register this browser. Body `{ endpoint, p256dh, auth, etiqueta? }`.
 *
 * The owner comes from the session, never from the body: accepting a `userId` here would let
 * anybody redirect somebody else's notifications to their own device.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const res = await guardarSuscripcion({
			dueno: { userId: actor.id },
			body,
			userAgent: request.headers.get("user-agent"),
			actor,
		});
		return json(res, { status: res.nueva ? 201 : 200 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/** DELETE /api/push?id=… or ?endpoint=… — unregister one of YOUR devices. */
export const DELETE: RequestHandler = async ({ locals, url }) => {
	const actor = requireUser(locals);

	try {
		return json(
			await borrarSuscripcion({
				dueno: { userId: actor.id },
				id: url.searchParams.get("id"),
				endpoint: url.searchParams.get("endpoint"),
				actor,
			}),
		);
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
