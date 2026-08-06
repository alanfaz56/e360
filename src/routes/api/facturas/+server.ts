import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { crearFactura, listFacturas, publicFactura } from "$lib/server/comercial";

/**
 * GET /api/facturas — Permission: `factura:read`.
 * Params: clienteId, notaId, estado, vencidas=1, page, perPage.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "factura:read");
	return json(
		await listFacturas({
			clienteId: url.searchParams.get("clienteId"),
			notaId: url.searchParams.get("notaId"),
			estado: url.searchParams.get("estado"),
			vencidas: url.searchParams.get("vencidas") === "1",
			page: Number(url.searchParams.get("page")) || 1,
			perPage: Number(url.searchParams.get("perPage")) || 25,
		}),
	);
};

/**
 * POST /api/facturas — issue an invoice. Permission: `factura:create`.
 * Body: { cotizacionId } to bill an authorized quote, or { clienteId | notaId, conceptos }.
 *       { condicionPago: "contado"|"credito", serie?, notas?, forzarCredito?, motivoCredito? }
 *
 * A credit sale checks the customer's limit INSIDE the transaction, so two invoices issued at the
 * same instant cannot both slip under the same headroom. Going over needs `cliente:credito` plus
 * a reason, and that override is its own audit entry.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json({ factura: publicFactura(await crearFactura({ actor, body })) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
