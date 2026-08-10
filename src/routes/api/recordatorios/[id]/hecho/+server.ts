import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { marcarRecordatorio, publicRecordatorio } from "$lib/server/recordatorios";

/**
 * POST /api/recordatorios/:id/hecho — mark done or reopen. Permission: `recordatorio:manage`.
 * Body: { hecho: boolean }
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	if (typeof body.hecho !== "boolean") error(400, "Se requiere `hecho` booleano");

	try {
		const recordatorio = await marcarRecordatorio({ actor, id: params.id!, hecho: body.hecho });
		return json({ recordatorio: publicRecordatorio(recordatorio) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
