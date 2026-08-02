import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { CitaError, crearCita, listCitas, parseCitaQuery, publicCita } from "$lib/server/citas";

/**
 * GET /api/citas — paginated appointment list. Permission: `cita:read`.
 * Params: desde, hasta (YYYY-MM-DD), estado, tipo, asignadoId, clienteId, q (folio, nombre,
 * teléfono, placas, motivo), page, perPage (capped at 100).
 * `mias=1` filters to the caller's own assignments — resolved from the session, not the URL.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const actor = requirePermission(locals, "cita:read");
	return json(await listCitas(parseCitaQuery(url.searchParams, actor.id)));
};

/**
 * POST /api/citas — book at the counter. Permission: `cita:create`.
 * Body: { nombre, telefono, motivo, tipo, inicio, fin?, direccionRecoleccion?, marca?, modelo?,
 *         anio?, placas?, email?, clienteId?, unidadId?, asignadoId?, notas? }
 *
 * The public form does NOT come through here — it is POST /api/citas/solicitudes.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cita = await crearCita({ actor, body });
		return json({ cita: publicCita(cita) }, { status: 201 });
	} catch (err) {
		if (err instanceof CitaError) error(err.status, err.message);
		throw err;
	}
};
