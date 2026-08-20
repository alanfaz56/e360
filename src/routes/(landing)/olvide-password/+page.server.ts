import { fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { auth } from "$lib/auth";
import { fallo } from "$lib/server/errores";

export const load: ServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, url.searchParams.get("next") ?? "/panel");
	return {};
};

export const actions: Actions = {
	default: async ({ request, url }) => {
		const form = await request.formData();
		const email = String(form.get("email") ?? "")
			.trim()
			.toLowerCase();

		if (!email) return fail(400, { email, message: "Escribe tu correo." });

		try {
			// Never reveals whether the address exists — same posture as login. better-auth itself
			// already simulates the work for an unknown address to keep the timing identical.
			await auth.api.requestPasswordReset({
				body: { email, redirectTo: new URL("/restablecer-password", url.origin).toString() },
			});
		} catch (err) {
			return fallo(err, { email });
		}

		return { enviado: true, email };
	},
};
