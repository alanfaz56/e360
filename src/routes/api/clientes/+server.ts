import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError, createCliente, listClientes, parseClienteQuery, publicCliente } from "$lib/server/clientes";

/**
 * GET /api/clientes — searchable, paginated customer list. Permission: `cliente:read`.
 * Params: q, tipo=persona|organizacion, archivados=1, page, perPage (capped at 100).
 * Archived customers are hidden unless `archivados=1`.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "cliente:read");
	return json(await listClientes(parseClienteQuery(url.searchParams)));
};

/**
 * POST /api/clientes — register a customer.
 * Body: { tipo, nombre|razonSocial, apellidos?, telefono?, email?, direccion?, notas?,
 *         rfc?, regimenFiscal?, codigoPostal?, usoCfdi? }
 * Permission and validation live in `createCliente`, shared with the /panel form action.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cliente = await createCliente({ actor, body });
		return json({ cliente: publicCliente(cliente) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
