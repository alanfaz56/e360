import { error, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { conFlash } from "$lib/flash";
import { can } from "$lib/roles";
import { esDueno, requirePermission, requireUser } from "$lib/server/guard";
import { fallo } from "$lib/server/errores";
import {
	estadoFacturacionApp,
	listPagosApp,
	montoMensualCentavos,
	pagoDelCicloActual,
	registrarPagoApp,
} from "$lib/server/facturacion-app";
import { formatoPesos } from "$lib/comercial";

/**
 * The shop's own payment screen: current cycle status, monthly amount, and — if already paid this
 * month — a confirmation instead of the upload form. Reachable regardless of block state (see
 * `panel/+layout.server.ts`'s redirect, which excludes this exact pathname on purpose).
 *
 * Two gates, not one, same reasoning as `/panel/ajustes`: `pago_app:upload` says "this role may
 * upload proof of payment for the shop"; `esDueno` is a DIFFERENT axis entirely — the software's
 * owner, who never uploads anything here but must always be able to see who paid and when. A
 * caller needs at least one of the two, never both, to reach this screen — checked with `can`/
 * `esDueno` directly rather than `requirePermission`, which only understands the first axis.
 */
export const load: ServerLoad = async ({ locals }) => {
	const actor = requireUser(locals);
	const dueno = esDueno(actor);
	if (!dueno && !can(actor.role, "pago_app:upload")) error(404, "No encontrado");

	if (dueno) {
		const [estado, historial] = await Promise.all([estadoFacturacionApp(actor), listPagosApp(actor)]);
		return { dueno: true, estado: estado.estado, historial };
	}

	const [estado, montoCentavos, pago] = await Promise.all([
		estadoFacturacionApp(actor),
		montoMensualCentavos(),
		pagoDelCicloActual(),
	]);
	return {
		dueno: false,
		estado: estado.estado,
		vencimientoLabel: estado.vencimientoLabel,
		montoFormateado: formatoPesos(montoCentavos),
		pago: pago
			? { nombre: pago.nombre, createdAt: pago.createdAt.toISOString(), montoFormateado: formatoPesos(pago.montoCentavos) }
			: null,
	};
};

export const actions: Actions = {
	registrar: async ({ locals, request }) => {
		const actor = requirePermission(locals, "pago_app:upload");
		const body = Object.fromEntries(await request.formData());
		try {
			await registrarPagoApp({ actor, body });
		} catch (err) {
			return fallo(err);
		}
		redirect(303, conFlash("/panel/facturacion-app", "pago_app.registrado"));
	},
};
