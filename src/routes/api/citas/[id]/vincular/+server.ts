import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { CitaError, publicCita, vincularCita } from "$lib/server/citas";

/**
 * POST /api/citas/[id]/vincular — attach the appointment to a real customer, vehicle and
 * (optionally) the person who will hand the unit over. Permission: `cita:update`.
 *
 * Body: { clienteId } | { crearCliente: "1", tipoCliente?, nombre?, apellidos?, razonSocial?,
 *                         telefono?, email? }
 *       { unidadId }  | { crearUnidad: "1", marca?, modelo?, anio?, placas?, vin? }
 *       { entregadorId? }
 *
 * Anything omitted on a create falls back to what the customer typed on the public form.
 * Creating routes through `createCliente` / `createUnidad`, so those tables' own rules and audit
 * entries apply. `confirmarCita` refuses until this has happened.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cita = await vincularCita({ actor, id: params.id!, body });
		return json({ cita: publicCita(cita) });
	} catch (err) {
		if (err instanceof CitaError) error(err.status, err.message);
		throw err;
	}
};
