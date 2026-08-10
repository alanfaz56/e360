import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import {
	crearRecordatorio,
	listRecordatorios,
	parseRecordatorioQuery,
	publicRecordatorio,
} from "$lib/server/recordatorios";

/**
 * GET /api/recordatorios — Permission: `recordatorio:manage`.
 * Params: vencidos=1, hecho=1, unidadId, clienteId, page, perPage.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "recordatorio:manage");
	return json(await listRecordatorios(parseRecordatorioQuery(url.searchParams)));
};

/**
 * POST /api/recordatorios — a manual follow-up on a vehicle.
 * Body: { unidadId, motivo, fecha, notaId? }
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	if (typeof body.unidadId !== "string" || !body.unidadId) error(400, "Se requiere `unidadId`");

	try {
		const recordatorio = await crearRecordatorio({
			actor,
			unidadId: body.unidadId,
			body: { motivo: body.motivo, fecha: body.fecha, notaId: body.notaId },
		});
		return json({ recordatorio: publicRecordatorio(recordatorio) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
