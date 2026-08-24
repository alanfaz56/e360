import { fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import * as chat from "$lib/server/canales/chat";
import { fallo } from "$lib/server/errores";
import { requirePermission } from "$lib/server/guard";

export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requirePermission(locals, "canal:chat");

	const conversaciones = await chat.listConversaciones(actor);
	const id = url.searchParams.get("id");
	const activa = id ? await chat.getConversacion(actor, id) : null;

	return { conversaciones, activa };
};

export const actions: Actions = {
	enviar: async ({ locals, request }) => {
		const actor = requirePermission(locals, "canal:chat");
		const form = await request.formData();
		const conversacionId = String(form.get("conversacionId") ?? "");
		const texto = String(form.get("texto") ?? "");

		try {
			await chat.enviarMensajeHumano({ actor, conversacionId, texto });
		} catch (err) {
			return fallo(err, { texto });
		}
		redirect(303, `/panel/chat?id=${conversacionId}`);
	},

	tomarControl: async ({ locals, request }) => {
		const actor = requirePermission(locals, "canal:chat");
		const form = await request.formData();
		const conversacionId = String(form.get("conversacionId") ?? "");

		try {
			await chat.tomarControl({ actor, conversacionId });
		} catch (err) {
			return fail(409, { message: err instanceof Error ? err.message : "No se pudo tomar la conversación." });
		}
		redirect(303, `/panel/chat?id=${conversacionId}`);
	},

	regresarBot: async ({ locals, request }) => {
		const actor = requirePermission(locals, "canal:chat");
		const form = await request.formData();
		const conversacionId = String(form.get("conversacionId") ?? "");

		try {
			await chat.regresarBot({ actor, conversacionId });
		} catch (err) {
			return fail(409, { message: err instanceof Error ? err.message : "No se pudo regresar al bot." });
		}
		redirect(303, `/panel/chat?id=${conversacionId}`);
	},
};
