import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { NotaError, crearNota, listNotas, parseNotaQuery, publicNota } from "$lib/server/notas";

/**
 * GET /api/notas — service notes. Permission: `nota:read`.
 * Params: q (folio, cliente, placas, VIN, económico, motivo), estado, clienteId, unidadId,
 * tallerId, abiertas=1, page, perPage.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "nota:read");
	return json(await listNotas(parseNotaQuery(url.searchParams)));
};

/**
 * POST /api/notas — open a note when the vehicle arrives. Permission: `nota:create`.
 * Body: { citaId } to receive an appointment, or { clienteId, unidadId, motivo } for a walk-in.
 * Optional `kilometraje` records the odometer in the same transaction.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json({ nota: publicNota(await crearNota({ actor, body })) }, { status: 201 });
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
