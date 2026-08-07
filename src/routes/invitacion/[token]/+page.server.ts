import { error, fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { auth } from "$lib/auth";
import { ROLE_LABEL, type Role } from "$lib/roles";
import { MIN_PASSWORD_LENGTH, acceptInvitation, findLiveInvitation } from "$lib/server/invitations";
import { fallo } from "$lib/server/errores";

export const load: ServerLoad = async ({ params }) => {
	const invitation = await findLiveInvitation(params.token!);
	if (!invitation) error(404, "Invitación inválida, vencida o ya utilizada.");

	return {
		email: invitation.email,
		roleLabel: ROLE_LABEL[invitation.role as Role] ?? invitation.role,
		minPasswordLength: MIN_PASSWORD_LENGTH,
	};
};

export const actions: Actions = {
	default: async ({ params, request }) => {
		const form = await request.formData();
		const name = String(form.get("name") ?? "");
		const password = String(form.get("password") ?? "");
		const confirm = String(form.get("confirm") ?? "");

		if (password !== confirm) {
			return fail(400, { name, message: "Las contraseñas no coinciden." });
		}

		let email: string;
		try {
			const result = await acceptInvitation({ token: params.token!, name, password });
			email = result.user.email;
		} catch (err) {
			return fallo(err, { name });
		}

		// Account exists now — log them straight in so the invite link ends at the panel,
		// not at another password prompt.
		let signedIn = true;
		try {
			await auth.api.signInEmail({ body: { email, password }, headers: request.headers });
		} catch {
			signedIn = false;
		}

		redirect(303, signedIn ? "/panel" : "/login");
	},
};
