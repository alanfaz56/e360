import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { cancelarRechazoCotizacion, solicitarRechazoCotizacion } from "$lib/server/comercial";
import { seguimientoPorToken } from "$lib/server/notas";
import { notaPorToken } from "$lib/server/notificaciones";
import { clavePublicaVapid } from "$lib/server/push";
import { fallaEnCarga, fallo } from "$lib/server/errores";

/**
 * The customer's window onto their own vehicle. **No account, no session** — the token in the URL
 * is the credential, which is the only thing that can work in an app with no public registration.
 *
 * Everything rendered here comes from `seguimientoPorToken`, which builds its payload through
 * `notaParaCliente` and filters comments to the visible ones. The partner workshop is absent by
 * construction, not by remembering to omit it here.
 */
export const load: ServerLoad = async ({ params, setHeaders }) => {
	// An unguessable URL should not be sitting in a shared cache or a search index.
	setHeaders({ "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" });

	try {
		return {
			...(await seguimientoPorToken(params.token!)),
			token: params.token!,
			clavePublica: await clavePublicaVapid(),
		};
	} catch (err) {
		fallaEnCarga(err);
	}
};

/**
 * The customer's only write path. **No session, no permission** — the token is the credential, the
 * same way the push endpoint next door works.
 *
 * Neither action changes the quote's `estado`. They record "quiero rechazarla" for the shop to
 * confirm; see `solicitarRechazoCotizacion` for why a link must not be able to close a quote by
 * itself. `folio` comes from the form, but the note comes from the TOKEN — so the worst a tampered
 * folio can do is name a quote on the same note the sender could already see.
 */
export const actions: Actions = {
	solicitarRechazo: async ({ params, request }) => {
		const data = await request.formData();
		try {
			const nota = await notaPorToken(params.token!);
			await solicitarRechazoCotizacion({
				notaId: nota.id,
				folio: data.get("folio"),
				motivo: data.get("motivo"),
			});
			redirect(303, `/seguimiento/${params.token}`);
		} catch (err) {
			return fallo(err);
		}
	},

	cancelarRechazo: async ({ params, request }) => {
		const data = await request.formData();
		try {
			const nota = await notaPorToken(params.token!);
			await cancelarRechazoCotizacion({ notaId: nota.id, folio: data.get("folio") });
			redirect(303, `/seguimiento/${params.token}`);
		} catch (err) {
			return fallo(err);
		}
	},
};
