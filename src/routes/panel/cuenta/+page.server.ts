import { fail, type Actions, type ServerLoad } from "@sveltejs/kit";
import { auth } from "$lib/auth";
import { ROLE_LABEL } from "$lib/roles";
import { requireUser } from "$lib/server/guard";
import { MIN_PASSWORD_LENGTH } from "$lib/server/invitations";
import { desvincularCanal, generarVinculacion, misCanales } from "$lib/server/canales/identidad";
import { ClienteError } from "$lib/server/clientes";

/**
 * Self-service password change (and, below, self-service channel linking). No permission key —
 * same reasoning as your own notification inbox in roles.ts: managing YOUR OWN account is
 * inherent to having one, not a capability the registry grants or withholds.
 */
export const load: ServerLoad = async ({ locals }) => {
	const actor = requireUser(locals);
	return {
		actor: { name: actor.name, email: actor.email, roleLabel: ROLE_LABEL[actor.role] },
		minPasswordLength: MIN_PASSWORD_LENGTH,
		canales: await misCanales(actor),
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireUser(locals);
		const form = await request.formData();
		const currentPassword = String(form.get("currentPassword") ?? "");
		const newPassword = String(form.get("newPassword") ?? "");
		const confirm = String(form.get("confirm") ?? "");

		if (!currentPassword) return fail(400, { message: "Escribe tu contraseña actual." });
		if (newPassword.length < MIN_PASSWORD_LENGTH) {
			return fail(400, { message: `La contraseña nueva debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` });
		}
		if (newPassword !== confirm) return fail(400, { message: "Las contraseñas nuevas no coinciden." });
		if (newPassword === currentPassword) {
			return fail(400, { message: "La contraseña nueva debe ser distinta de la actual." });
		}

		try {
			// Every OTHER session dies — a password change is exactly the moment a stolen
			// session cookie should stop working too. This one keeps working: it's the
			// request that just proved it holds the current password.
			await auth.api.changePassword({
				body: { currentPassword, newPassword, revokeOtherSessions: true },
				headers: request.headers,
			});
		} catch {
			// Deliberately vague, same reasoning as /login: never confirm which part was wrong.
			return fail(400, { message: "Tu contraseña actual es incorrecta." });
		}

		return { success: true };
	},

	vincularTelegram: async ({ locals }) => {
		const actor = requireUser(locals);
		const { codigo, expiraMinutos } = await generarVinculacion(actor, "telegram");
		return { canal: "telegram" as const, codigo, expiraMinutos };
	},

	desvincularTelegram: async ({ locals }) => {
		const actor = requireUser(locals);
		try {
			await desvincularCanal(actor, "telegram");
			return { canalDesvinculado: "telegram" as const };
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},
};
