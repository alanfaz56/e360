import { fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requireUser } from "$lib/server/guard";
import {
	borrarSuscripcion,
	guardarPreferencias,
	listarDispositivos,
	listarNotificaciones,
	marcarLeidas,
	parseNotificacionQuery,
	preferencias,
} from "$lib/server/notificaciones";
import { clavePublicaVapid } from "$lib/server/push";
import { EVENTOS_EMPLEADO } from "$lib/notificaciones";

/**
 * Your notifications: the full history, which events reach you, and which devices are registered.
 *
 * No permission key — this is your own inbox and your own devices, so it is `requireUser`. That is
 * also what keeps `permissionsFor('taller')` empty: adding a `notificacion:read` key would put a
 * permission on the `taller` role for the first time, which is a decision nobody has made.
 *
 * Every action is a real form action calling the same shared functions the API routes call, so a
 * no-JS browser can read, mark read, change preferences and drop a device. Only *turning push on*
 * needs JavaScript, because the Push API is JavaScript.
 */
export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requireUser(locals);
	const query = parseNotificacionQuery(url.searchParams);

	const [bandeja, prefs, dispositivos] = await Promise.all([
		listarNotificaciones(actor, query),
		preferencias(actor.id),
		listarDispositivos(actor.id),
	]);

	return {
		...bandeja,
		preferencias: prefs,
		dispositivos,
		clavePublica: clavePublicaVapid(),
		soloNoLeidas: query.noLeidas === true,
	};
};

export const actions: Actions = {
	/** Mark everything read. Also the target of the drawer's button, from any panel screen. */
	leerTodas: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		await marcarLeidas(actor);

		// The drawer posts where it came from, so "mark all read" does not teleport somebody off
		// the screen they were working on.
		const volverA = String(data.get("volverA") ?? "");
		if (volverA.startsWith("/panel")) redirect(303, volverA);
		redirect(303, "/panel/notificaciones");
	},

	leerUna: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		await marcarLeidas(actor, [String(data.get("id") ?? "")]);
		return { ok: true };
	},

	/**
	 * Save preferences. The form posts a checkbox per channel per event; an unchecked box posts
	 * nothing at all, which is why the loop walks the CATALOGUE rather than the submitted keys —
	 * reading only what arrived would make "turn everything off" indistinguishable from an empty
	 * submit and silently leave it all on.
	 */
	preferencias: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();

		const cambios: Record<string, { enApp: boolean; push: boolean }> = {};
		for (const evento of EVENTOS_EMPLEADO) {
			cambios[evento] = {
				enApp: data.get(`app:${evento}`) !== null,
				push: data.get(`push:${evento}`) !== null,
			};
		}

		try {
			await guardarPreferencias({ actor, cambios });
			return { guardado: true };
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	quitarDispositivo: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();

		try {
			await borrarSuscripcion({ dueno: { userId: actor.id }, id: String(data.get("id") ?? ""), actor });
			return { quitado: true };
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},
};
