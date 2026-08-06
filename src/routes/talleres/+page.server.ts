import { fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { BENEFICIOS_TALLER, REQUISITOS_TALLER } from "$lib/talleres";
import { ClienteError } from "$lib/server/clientes";
import { solicitarTaller } from "$lib/server/talleres";
import { turnstileSiteKey } from "$lib/server/turnstile";

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
			if (err instanceof ClienteError) {
				// Hand the values back so nobody retypes the whole form after one bad field.
				delete body["cf-turnstile-response"];
				return fail(err.status, { message: err.message, valores: body });
			}
			throw err;
		}
	},
};
