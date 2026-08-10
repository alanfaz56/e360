import { fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { auth } from "$lib/auth";
import { fallo } from "$lib/server/errores";

/**
 * Reached from the email link, which better-auth already validated (`GET /reset-password/:token`
 * redirects here with `?token=` only on success, `?error=INVALID_TOKEN` otherwise). Nothing here
 * re-checks the token before showing the form — that already happened server-side; this page only
 * has to decide whether to render the form or the "link expired" message.
 */
export const load: ServerLoad = async ({ url }) => {
	const token = url.searchParams.get("token");
	const invalido = url.searchParams.get("error") !== null;
	return { token, invalido };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const token = String(form.get("token") ?? "");
		const password = String(form.get("password") ?? "");
		const confirmar = String(form.get("confirmar") ?? "");

		if (!token) return fail(400, { message: "El link ya no es válido. Pide uno nuevo." });
		if (password.length < 8) return fail(400, { message: "La contraseña debe tener al menos 8 caracteres." });
		if (password !== confirmar) return fail(400, { message: "Las contraseñas no coinciden." });

		try {
			await auth.api.resetPassword({ body: { newPassword: password, token } });
		} catch (err) {
			return fallo(err);
		}

		redirect(303, "/login");
	},
};
