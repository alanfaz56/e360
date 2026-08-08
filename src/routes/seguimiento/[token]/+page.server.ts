import { type ServerLoad } from "@sveltejs/kit";
import { seguimientoPorToken } from "$lib/server/notas";
import { clavePublicaVapid } from "$lib/server/push";
import { fallaEnCarga } from "$lib/server/errores";

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
