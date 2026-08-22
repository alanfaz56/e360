import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { GRUPOS, GRUPO_KEYS } from "$lib/ajustes";
import { PROVEEDOR_DEFAULT, PROVEEDORES } from "$lib/server/pac";
import { conFlash } from "$lib/flash";
import { guardarAjustes, leerAjustes, puedeGuardarSecretos } from "$lib/server/ajustes";
import { obtenerInfoWebhook, registrarWebhook, telegramConfigurado } from "$lib/server/canales/telegram";
import { ClienteError } from "$lib/server/clientes";
import { fallaEnCarga, fallo } from "$lib/server/errores";
import { requireDueno, requireUser } from "$lib/server/guard";
import { usoDeTimbrado } from "$lib/server/timbrado";

/**
 * System settings. Gated by `requireDueno`, which answers 404 to anybody who is not on the
 * `OWNER_EMAILS` list — including an Admin. The shop's own Admin manages the shop; the
 * credentials that stamp CFDIs in our name are not part of that job.
 */
export const load: ServerLoad = async ({ locals, url }) => {
	requireDueno(locals, "ajustes:read");

	try {
		// Usage over a window, defaulting to the current month — which is how a PAC bills.
		const dias = Number(url.searchParams.get("dias")) || 30;
		const desde = new Date(Date.now() - dias * 86_400_000);

		const [ajustes, uso] = await Promise.all([leerAjustes(), usoDeTimbrado(desde)]);

		// What Telegram actually has on file — separate from the bot token/secret above, and the
		// one thing that tells "nobody ever registered it for this environment" apart from "it's
		// registered but broken". Best-effort: a bad token must not take the whole settings page
		// down, since this screen is exactly where someone would come to fix that token.
		const telegramWebhook = (await telegramConfigurado())
			? await obtenerInfoWebhook().catch((err) => ({ error: err instanceof Error ? err.message : String(err) }))
			: null;

		return {
			ajustes,
			uso,
			dias,
			grupos: GRUPO_KEYS.map((k) => ({ clave: k, ...GRUPOS[k] })),
			// Without `AJUSTES_SECRET_KEY` no credential can be stored at all, and the screen has to
			// say so up front instead of failing on save.
			puedeGuardarSecretos: puedeGuardarSecretos(),
			proveedores: Object.values(PROVEEDORES).map((p) => ({ clave: p.clave, label: p.label })),
			proveedorActivo: PROVEEDOR_DEFAULT,
			telegramWebhook,
		};
	} catch (err) {
		fallaEnCarga(err);
	}
};

export const actions: Actions = {
	guardar: async ({ locals, request }) => {
		// Re-checked here and not inherited from the load: an action is its own entry point.
		requireDueno(locals, "ajustes:manage");
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;

		try {
			await guardarAjustes({ actor, body });
		} catch (err) {
			return fallo(err);
		}
		redirect(303, conFlash("/panel/ajustes", "ajuste.guardar"));
	},

	/**
	 * Points Telegram at THIS deployment. `url.origin` — the origin the request actually arrived
	 * on — not `BETTER_AUTH_URL`: an env var can be stale or absent for a given environment, but
	 * the request's own origin is definitionally the address that just reached us. This is the
	 * step `scripts/telegram-set-webhook.ts` automates for local/CI use; this button is the same
	 * call for whoever cannot run a script against prod's env.
	 */
	registrarWebhookTelegram: async ({ locals, url }) => {
		requireDueno(locals, "ajustes:manage");
		try {
			// Same guard `scripts/telegram-set-webhook.ts` opens with — Telegram rejects anything
			// else, and a localhost origin (testing this button in dev) would otherwise reach that
			// rejection as a raw Telegram API error instead of a message that explains why.
			if (url.protocol !== "https:") {
				throw new ClienteError(400, "Esta URL no es https — Telegram la rechaza. Este botón solo sirve algo desde el dominio real de producción.");
			}
			await registrarWebhook(`${url.origin}/api/telegram/webhook`);
		} catch (err) {
			return fallo(err);
		}
		redirect(303, conFlash("/panel/ajustes", "canal.webhook_registrado"));
	},
};
