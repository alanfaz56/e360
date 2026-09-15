import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
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
 *
 * A THIRD kind of caller reaches this route too: any role with neither axis (e.g. operador,
 * taller) that the layout's block redirect still sends here, because that redirect fires for
 * everyone non-owner regardless of whether they can act on this screen. Answering 404 to them
 * used to be a dead end — blocked, and the one screen they're redirected to refuses them. They
 * get a read-only view of the same status instead, so at least the message is legible.
 */
export const load: ServerLoad = async ({ locals }) => {
	const actor = requireUser(locals);
	const dueno = esDueno(actor);
	const puedeSubir = can(actor.role, "pago_app:upload");

	if (dueno) {
		const [estado, historial] = await Promise.all([estadoFacturacionApp(actor), listPagosApp(actor)]);
		return { vista: "dueno" as const, estado: estado.estado, historial };
	}

	if (!puedeSubir) {
		const estado = await estadoFacturacionApp(actor);
		return { vista: "soloLectura" as const, estado: estado.estado, vencimientoLabel: estado.vencimientoLabel };
	}

	const [estado, montoCentavos, pago] = await Promise.all([
		estadoFacturacionApp(actor),
		montoMensualCentavos(),
		pagoDelCicloActual(),
	]);
	return {
		vista: "subir" as const,
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
