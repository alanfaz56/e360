import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { getFactura, publicFactura, registrarPago } from "$lib/server/comercial";

/** GET /api/facturas/[id]/pagos — Permission: `pago:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "pago:read");
	try {
		const factura = publicFactura(await getFactura(params.id!));
		return json({ pagos: factura.pagos, total: factura.total, pagado: factura.pagado, saldo: factura.saldo });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * POST /api/facturas/[id]/pagos — register a payment, partial or full.
 * Body: { monto, metodo, referencia?, notas?, pagadoAt? }. Permission: `pago:register`.
 *
 * The invoice becomes `pagada` when the payments cover it — computed, never set by hand.
 * Overpayment is refused: nine times in ten it is a typo, and the tenth is a credit note.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const pago = await registrarPago({ actor, facturaId: params.id!, body });
		const factura = publicFactura(await getFactura(params.id!));
		return json(
			{
				pago: { id: pago.id, monto: pago.monto.toString(), metodo: pago.metodo },
				saldo: factura.saldo,
				liquidada: factura.liquidada,
			},
			{ status: 201 },
		);
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
