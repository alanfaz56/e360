import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { BENEFICIOS_TALLER, REQUISITOS_TALLER } from "$lib/talleres";
import { solicitarTaller } from "$lib/server/talleres";
import { turnstileSiteKey } from "$lib/server/turnstile";
import { fallo } from "$lib/server/errores";

/**
 * The public page where a workshop applies to become a certified Estación 360 partner.
 *
 * Dynamic, not prerendered: it needs the Turnstile site key from the environment. Same shape as
 * /citas — anonymous, Turnstile as the only gate, POST → redirect → GET so a refresh cannot file
 * the application twice.
 */
export const load: ServerLoad = async () => ({
	siteKey: turnstileSiteKey(),
	beneficios: BENEFICIOS_TALLER,
	requisitos: REQUISITOS_TALLER,
});

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const data = await request.formData();
		const body = Object.fromEntries(data) as Record<string, unknown>;

		try {
			await solicitarTaller({
				body,
				// Turnstile posts its token under this exact field name.
				turnstileToken: data.get("cf-turnstile-response"),
				ip: getClientAddress(),
			});
			redirect(303, "/talleres/gracias");
		} catch (err) {
			// Hand the values back so nobody retypes the whole form after one bad field. The token
			// is single-use and already spent, so it never goes back to the browser.
			delete body["cf-turnstile-response"];
			return fallo(err, { valores: body });
		}
	},
};
