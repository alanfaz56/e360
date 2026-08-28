import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { getNotaVenta, publicNotaVenta, registrarPagoNotaVenta } from "$lib/server/comercial";

/** GET /api/notas-venta/[id]/pagos — Permission: `pago:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "pago:read");
	try {
		const notaVenta = publicNotaVenta(await getNotaVenta(params.id!));
		return json({ pagos: notaVenta.pagos, total: notaVenta.total, pagado: notaVenta.pagado, saldo: notaVenta.saldo });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * POST /api/notas-venta/[id]/pagos — register a payment, partial or full.
 * Body: { monto, metodo, referencia?, notas?, pagadoAt? }. Permission: `pago:register`.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const pago = await registrarPagoNotaVenta({ actor, notaVentaId: params.id!, body });
		const notaVenta = publicNotaVenta(await getNotaVenta(params.id!));
		return json(
			{
				pago: { id: pago.id, monto: pago.monto.toString(), metodo: pago.metodo },
				saldo: notaVenta.saldo,
				liquidada: notaVenta.liquidada,
			},
			{ status: 201 },
		);
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
