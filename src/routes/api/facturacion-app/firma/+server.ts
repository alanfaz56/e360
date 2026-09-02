import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { firmarSubidaPagoApp } from "$lib/server/facturacion-app";

/**
 * POST /api/facturacion-app/firma — a short-lived URL to PUT the current month's payment evidence
 * straight to R2. Body: { nombre, contentType, bytes? }. Permission: `pago_app:upload`.
 *
 * Same two-step upload as `/api/notas/:id/evidencias/firma`: the file goes to R2 directly, never
 * through the server. The key is generated server-side and carries the current cycle, so a caller
 * can never point it at another month.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const firma = firmarSubidaPagoApp({ actor, nombre: body.nombre, contentType: body.contentType, bytes: body.bytes });
		return json(firma);
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
