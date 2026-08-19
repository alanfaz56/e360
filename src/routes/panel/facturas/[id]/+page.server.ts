import { type Actions, type ServerLoad } from "@sveltejs/kit";
import { can } from "$lib/roles";
import { requirePermission, requireUser } from "$lib/server/guard";
import { getFactura, publicFactura } from "$lib/server/comercial";
import { fallaEnCarga, fallo } from "$lib/server/errores";
import { timbrarFactura } from "$lib/server/timbrado";

/**
 * A single invoice, on its own screen. `factura:read`.
 *
 * Until now a factura was only ever seen embedded in its nota — this exists for the cases with
 * no nota behind them (público en general, ad-hoc) and for sharing a direct link to one invoice.
 * Same shared functions the nota detail page and the JSON API call (Rule 4): nothing here is a
 * second implementation of stamping or cancelling.
 */
export const load: ServerLoad = async ({ locals, params }) => {
	const actor = requirePermission(locals, "factura:read");

	let factura;
	try {
		factura = publicFactura(await getFactura(params.id!));
	} catch (err) {
		fallaEnCarga(err);
	}

	return {
		factura,
		puede: {
			timbrar: can(actor.role, "factura:timbrar"),
		},
	};
};

export const actions: Actions = {
	/**
	 * Stamp at the SAT. No confirmation drawer — everything the CFDI needs is already on the
	 * invoice, and a second click answers 409 with the UUID it already has rather than spending
	 * another timbre. Same function `/panel/notas/[id]` and the JSON API call.
	 */
	timbrar: async ({ locals, params }) => {
		const actor = requireUser(locals);
		try {
			await timbrarFactura({ actor, id: params.id! });
			return { ok: "Factura timbrada." };
		} catch (err) {
			return fallo(err);
		}
	},
};
