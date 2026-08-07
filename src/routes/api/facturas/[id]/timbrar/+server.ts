import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { getFactura, publicFactura } from "$lib/server/comercial";
import { timbrarFactura } from "$lib/server/timbrado";
import { requireUser } from "$lib/server/guard";

/**
 * POST /api/facturas/[id]/timbrar — stamp at the SAT. Permission: `factura:timbrar`.
 *
 * No body: everything the CFDI needs is already on the invoice, the customer and the quote. That
 * is deliberate — a request body here would be a second place the amounts could come from.
 *
 * Irreversible and it spends a timbre, so it is a POST to its own path rather than a PATCH that
 * could be replayed by a retrying client. Already stamped answers 409 with the UUID it has.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
	const actor = requireUser(locals);
	try {
		await timbrarFactura({ actor, id: params.id! });
		return json({ factura: publicFactura(await getFactura(params.id!)) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
