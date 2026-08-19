import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { obtenerReceptorPac, vincularClienteConPac } from "$lib/server/timbrado";
import { requireUser } from "$lib/server/guard";

/**
 * GET /api/clientes/[id]/facturacion — what the PAC has on file for this customer right now, in
 * our terms (`obtenerReceptor` never returns their raw payload). `null` when this RFC has no
 * receptor registered yet — that is an answer, not a failure. Permission: `factura:timbrar`.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const actor = requireUser(locals);
	try {
		return json({ receptor: await obtenerReceptorPac({ actor, clienteId: params.id! }) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

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
