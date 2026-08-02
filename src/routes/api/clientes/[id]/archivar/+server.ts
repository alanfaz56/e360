import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError, publicCliente, setClienteArchivado } from "$lib/server/clientes";

/**
 * POST /api/clientes/:id/archivar — archive or restore. Permission: `cliente:archive`.
 * Body: { archivado: boolean }
 *
 * Archiving hides the customer from lists but keeps the record and its history, so nothing
 * is ever orphaned. Reversible by posting `archivado: false`.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	if (typeof body.archivado !== "boolean") error(400, "Se requiere `archivado` booleano");

	try {
		const cliente = await setClienteArchivado({ actor, id: params.id!, archivado: body.archivado });
		return json({ cliente: publicCliente(cliente) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
