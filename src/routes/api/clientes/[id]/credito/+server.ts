import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { actualizarCredito, saldoCliente } from "$lib/server/comercial";

/**
 * GET /api/clientes/[id]/credito — terms, balance and headroom. Permission: `factura:read`.
 * Only issued CREDIT invoices count against the limit; cash sales and cancelled ones do not.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "factura:read");
	const estado = await saldoCliente(params.id!);
	// `saldoCents`/`limiteCents` are internal bigints — not part of the public shape.
	const { saldoCents: _s, limiteCents: _l, ...publico } = estado;
	return json(publico);
};

/**
 * PATCH /api/clientes/[id]/credito — set or clear the terms. Permission: `cliente:credito`.
 * Body: { limiteCredito, diasCredito } — or `limiteCredito: ""` to withdraw credit entirely.
 * Both move together; a CHECK constraint enforces that too.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		await actualizarCredito({ actor, clienteId: params.id!, body });
		const estado = await saldoCliente(params.id!);
		const { saldoCents: _s, limiteCents: _l, ...publico } = estado;
		return json(publico);
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
