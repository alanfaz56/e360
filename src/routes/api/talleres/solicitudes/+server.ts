import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { solicitarTaller } from "$lib/server/talleres";

/**
 * POST /api/talleres/solicitudes — a workshop applies to be certified. **ANÓNIMO.**
 *
 * No permission, by design: it is the public form's endpoint and Turnstile is its gate. The same
 * shape as POST /api/citas/solicitudes.
 *
 * The response carries only the name they just typed and the status — no id — so it cannot be
 * used to read back or enumerate anybody else's application.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const solicitud = await solicitarTaller({
			body,
			turnstileToken: (body as Record<string, unknown>).turnstileToken,
			ip: getClientAddress(),
		});
		return json({ solicitud }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
