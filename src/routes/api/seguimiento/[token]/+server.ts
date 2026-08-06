import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { seguimientoPorToken } from "$lib/server/notas";
import { borrarSuscripcion, guardarSuscripcion, notaPorToken } from "$lib/server/notificaciones";
import { clavePublicaVapid } from "$lib/server/push";

/**
 * The customer's endpoint. **No session, no permission** — the token is the credential.
 *
 * Deliberately a separate route group from /api/notificaciones and /api/push rather than those
 * endpoints accepting an optional token: mixing anonymous token auth into the staff endpoints is
 * how a bug there turns into somebody reading a staff inbox. Both groups call the same shared
 * server functions, so the rules cannot drift — only the way the caller is identified differs.
 */

/** GET /api/seguimiento/[token] — the note as the customer may see it. */
export const GET: RequestHandler = async ({ params }) => {
	try {
		return json({ ...(await seguimientoPorToken(params.token!)), clavePublica: clavePublicaVapid() });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * POST /api/seguimiento/[token] — turn on push for this phone.
 *
 * The subscription is filed against the CUSTOMER, not the note, so it keeps working for their
 * next visit instead of dying with this job. The token only proves which customer is asking.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const nota = await notaPorToken(params.token!);
		const res = await guardarSuscripcion({
			dueno: { clienteId: nota.clienteId },
			body,
			userAgent: request.headers.get("user-agent"),
			// No actor: there is no account behind this. The subscription itself is the record, and
			// writing an audit row with a null actor here would say nothing the row does not.
			actor: null,
		});
		return json(res, { status: res.nueva ? 201 : 200 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/** DELETE /api/seguimiento/[token]?endpoint=… — turn push back off on this phone. */
export const DELETE: RequestHandler = async ({ params, url }) => {
	try {
		const nota = await notaPorToken(params.token!);
		return json(
			await borrarSuscripcion({
				dueno: { clienteId: nota.clienteId },
				endpoint: url.searchParams.get("endpoint"),
				actor: null,
			}),
		);
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
