import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { vincularClienteConPac } from "$lib/server/timbrado";
import { requireUser } from "$lib/server/guard";

/**
 * POST /api/clientes/[id]/facturacion — find or create this customer AT the PAC and remember the
 * link. Permission: `factura:timbrar`.
 *
 * The same thing stamping does on its way past, run on purpose so the link can be checked before
 * an invoice depends on it. Idempotent: a customer already registered over there is found by RFC,
 * never duplicated, and the uid is stored **with its environment** — a sandbox uid names nothing
 * in production.
 *
 * Answers `{ uid, entorno }`. Refuses with a 409 naming the missing field when the customer has no
 * RFC, régimen, código postal or uso de CFDI — those are ours to fix, not the PAC's to guess.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
	const actor = requireUser(locals);
	try {
		return json(await vincularClienteConPac({ actor, clienteId: params.id! }));
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
