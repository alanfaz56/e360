import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { facturarNotaVenta, publicFactura } from "$lib/server/comercial";

/**
 * POST /api/notas-venta/[id]/facturar — promote a nota de venta into a real, IVA-carrying factura.
 * Body: { condicionPago?, serie?, notas?, forzarCredito?, motivoCredito? }.
 * Permission: `nota_venta:facturar`.
 *
 * Every payment already registered on the nota de venta moves onto the new factura — nothing is
 * re-collected. See `facturarNotaVenta`.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const factura = await facturarNotaVenta({ actor, id: params.id!, body });
		return json({ factura: publicFactura(factura) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
