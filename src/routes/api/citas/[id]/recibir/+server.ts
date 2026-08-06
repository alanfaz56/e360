import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { NotaError, crearNota, publicNota } from "$lib/server/notas";

/**
 * POST /api/citas/[id]/recibir — the vehicle arrived: open its service note.
 * Body: { kilometraje?, observaciones? }. Permission: `nota:create`.
 *
 * Carries the appointment's cliente and unidad across, moves the cita to `en_proceso`, and — when
 * the odometer is given — writes the unit's mileage history in the same transaction. One press at
 * the counter, so nobody retypes what the appointment already knows.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const nota = await crearNota({ actor, body: { ...body, citaId: params.id } });
		return json({ nota: publicNota(nota) }, { status: 201 });
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
