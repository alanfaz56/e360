import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { getFactura, publicFactura } from "$lib/server/comercial";
import { cancelarEnSat } from "$lib/server/timbrado";
import { requireUser } from "$lib/server/guard";

/**
 * POST /api/facturas/[id]/cancelar-sat — cancel a STAMPED invoice. Permission: `factura:cancel`.
 *
 * Body: `{ motivo: "01".."04", sustituye?: uuid, explicacion }`.
 *
 * `motivo` is the SAT's clave — which box gets ticked. `explicacion` is ours, in words, and it is
 * what somebody reads six months later; the clave never says why. `sustituye` is required by, and
 * only accepted for, motivo `01`.
 *
 * The answer carries `cancelacionEstatus`: the SAT can hold a cancellation waiting for the
 * receiver to accept it, and until it does the invoice is **still live**. An integrator must read
 * that field rather than assuming a 200 means cancelled.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const { resultado } = await cancelarEnSat({
			actor,
			id: params.id!,
			motivo: body.motivo,
			sustituye: body.sustituye,
			explicacion: body.explicacion,
		});
		return json({
			factura: publicFactura(await getFactura(params.id!)),
			resultado: { estatus: resultado.estatus, mensaje: resultado.mensaje },
		});
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
