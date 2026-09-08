import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import {
	cancelarAutorizacionCotizacionPorToken,
	cancelarRechazoCotizacionPorToken,
	cotizacionPorToken,
	publicCotizacionCliente,
	solicitarAutorizacionCotizacionPorToken,
	solicitarRechazoCotizacionPorToken,
} from "$lib/server/comercial";
import { fallaEnCarga, fallo } from "$lib/server/errores";

/** Customer-facing standalone quote. The opaque token in the URL is the credential. */
export const load: ServerLoad = async ({ params, setHeaders }) => {
	setHeaders({ "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" });
	try {
		return { cotizacion: publicCotizacionCliente(await cotizacionPorToken(params.token!)) };
	} catch (err) {
		fallaEnCarga(err);
	}
};

export const actions: Actions = {
	/** Request approval only; a signed-in user still confirms identity, medium and final state. */
	solicitarAutorizacion: async ({ params }) => {
		try {
			await solicitarAutorizacionCotizacionPorToken(params.token!);
			redirect(303, `/cotizacion/${params.token}`);
		} catch (err) {
			return fallo(err);
		}
	},

	cancelarAutorizacion: async ({ params }) => {
		try {
			await cancelarAutorizacionCotizacionPorToken(params.token!);
			redirect(303, `/cotizacion/${params.token}`);
		} catch (err) {
			return fallo(err);
		}
	},

	/** Record intent only; a staff member still confirms the rejection and owns the audit event. */
	solicitarRechazo: async ({ params, request }) => {
		const data = await request.formData();
		try {
			await solicitarRechazoCotizacionPorToken(params.token!, data.get("motivo"));
			redirect(303, `/cotizacion/${params.token}`);
		} catch (err) {
			return fallo(err);
		}
	},

	cancelarRechazo: async ({ params }) => {
		try {
			await cancelarRechazoCotizacionPorToken(params.token!);
			redirect(303, `/cotizacion/${params.token}`);
		} catch (err) {
			return fallo(err);
		}
	},
};
