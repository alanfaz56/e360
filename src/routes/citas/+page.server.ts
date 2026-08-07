import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { FRANJA_KEYS, FRANJAS, CITA_TIPO_KEYS, CITA_TIPOS } from "$lib/citas";
import { hoy, sumarDias } from "$lib/agenda";
import { solicitarCita } from "$lib/server/citas";
import { turnstileSiteKey } from "$lib/server/turnstile";
import { fallo } from "$lib/server/errores";

/**
 * The public booking page. Dynamic, not prerendered: it needs the Turnstile site key from the
 * environment, and the min/max dates move every day.
 */
export const load: ServerLoad = async () => ({
	siteKey: turnstileSiteKey(),
	// The shop takes bookings from today up to three months out. Native <input type="date">
	// enforces this in the browser; the server re-checks (past dates are refused outright).
	minima: hoy(),
	maxima: sumarDias(hoy(), 90),
	franjas: FRANJA_KEYS.map((k) => ({ value: k, ...FRANJAS[k] })),
	tipos: CITA_TIPO_KEYS.map((k) => ({ value: k, ...CITA_TIPOS[k] })),
});

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const data = await request.formData();
		const body = Object.fromEntries(data) as Record<string, unknown>;

		try {
			const cita = await solicitarCita({
				body,
				// Turnstile posts its token under this exact field name.
				turnstileToken: data.get("cf-turnstile-response"),
				ip: getClientAddress(),
			});
			// POST → redirect → GET, so a refresh cannot book a second appointment.
			redirect(303, `/citas/gracias?folio=${cita.folio}`);
		} catch (err) {
			// Hand the values back so nobody retypes the whole form after one bad field. The token
			// is single-use and already spent, so it never goes back to the browser.
			delete body["cf-turnstile-response"];
			return fallo(err, { valores: body });
		}
	},
};
