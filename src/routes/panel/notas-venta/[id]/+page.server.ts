import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { can } from "$lib/roles";
import { conFlash } from "$lib/flash";
import {
	cancelarNotaVenta,
	facturarNotaVenta,
	getNotaVenta,
	publicNotaVenta,
	registrarPagoNotaVenta,
} from "$lib/server/comercial";
import { fallaEnCarga, fallo } from "$lib/server/errores";
import { requirePermission, requireUser } from "$lib/server/guard";
import { hoy } from "$lib/agenda";

/**
 * A single nota de venta, on its own screen. `nota_venta:read`.
 *
 * Until now a nota de venta was only ever seen embedded in its nota — this exists for the
 * cases with no nota behind them (cotización standalone) and for linking to it directly, same
 * reasoning as `/panel/facturas/[id]`. Same shared functions the nota detail page and the JSON
 * API call (Rule 4): nothing here is a second implementation of pagar/cancelar/facturar.
 */
export const load: ServerLoad = async ({ locals, params }) => {
	const actor = requirePermission(locals, "nota_venta:read");

	let notaVenta;
	try {
		notaVenta = publicNotaVenta(await getNotaVenta(params.id!));
	} catch (err) {
		fallaEnCarga(err);
	}

	return {
		notaVenta,
		hoy: hoy(),
		puede: {
			cobrar: can(actor.role, "pago:register"),
			cancelar: can(actor.role, "nota_venta:cancel"),
			facturar: can(actor.role, "nota_venta:facturar"),
			credito: can(actor.role, "cliente:credito"),
		},
	};
};

export const actions: Actions = {
	pagar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await registrarPagoNotaVenta({
				actor,
				notaVentaId: params.id!,
				body: {
					monto: data.get("monto"),
					metodo: data.get("metodo"),
					referencia: data.get("referencia"),
					pagadoAt: data.get("pagadoAt"),
					notas: data.get("notas"),
				},
			});
			redirect(303, conFlash(`/panel/notas-venta/${params.id}`, "pago.registrar"));
		} catch (err) {
			return fallo(err);
		}
	},

	cancelar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await cancelarNotaVenta({ actor, id: params.id!, motivo: data.get("motivo") });
			redirect(303, conFlash(`/panel/notas-venta/${params.id}`, "nota_venta.cancelar"));
		} catch (err) {
			return fallo(err);
		}
	},

	facturar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			const factura = await facturarNotaVenta({
				actor,
				id: params.id!,
				body: {
					condicionPago: data.get("condicionPago"),
					serie: data.get("serie"),
					notas: data.get("notas"),
					forzarCredito: data.get("forzarCredito"),
					motivoCredito: data.get("motivoCredito"),
				},
			});
			redirect(303, conFlash(`/panel/facturas/${factura.id}`, "factura.crear"));
		} catch (err) {
			return fallo(err);
		}
	},
};
