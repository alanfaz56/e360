import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { cancelarFactura, getFactura, publicFactura } from "$lib/server/comercial";

/** GET /api/facturas/[id] — with its payments and the outstanding balance. `factura:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "factura:read");
	try {
		return json({ factura: publicFactura(await getFactura(params.id!)) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * DELETE /api/facturas/[id] — cancel, with a reason. Permission: `factura:cancel`.
 * Refused once payments exist: money that came in does not disappear because a document was
 * voided. That case is a credit note, which is a different document.
 */
export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const factura = await cancelarFactura({ actor, id: params.id!, motivo: body.motivo });
		return json({ factura: publicFactura(factura) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
