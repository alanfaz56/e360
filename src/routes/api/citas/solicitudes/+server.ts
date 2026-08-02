import { error, json, type RequestHandler } from "@sveltejs/kit";
import { CitaError, solicitarCita } from "$lib/server/citas";

/**
 * POST /api/citas/solicitudes — ANONYMOUS. The public booking form, and the only route in the
 * app that does not call `requireUser`.
 *
 * Body: { nombre, telefono, motivo, tipo, fecha, franja, direccionRecoleccion?, marca?, modelo?,
 *         anio?, placas?, email?, turnstileToken }
 *
 * Cloudflare Turnstile is the gate; `solicitarCita` forces every invariant (origen, estado, no
 * links, no hour, no notes) rather than trusting the body.
 *
 * The response is deliberately just the folio and the day asked for — no id, so the endpoint can
 * never be used to read back or enumerate somebody else's appointment.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cita = await solicitarCita({
			body,
			turnstileToken: body.turnstileToken ?? body["cf-turnstile-response"],
			ip: getClientAddress(),
		});
		return json(
			{ folio: cita.folio, fecha: cita.fecha.toISOString().slice(0, 10), franja: cita.franja },
			{ status: 201 },
		);
	} catch (err) {
		if (err instanceof CitaError) error(err.status, err.message);
		throw err;
	}
};
