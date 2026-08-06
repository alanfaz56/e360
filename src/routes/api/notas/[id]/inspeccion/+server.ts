import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { NotaError, faltantesInventario, inspeccionarNota, publicNota } from "$lib/server/notas";

/**
 * POST /api/notas/[id]/inspeccion — the intake walk-around. Permission: `nota:inspect`.
 * Body: { kilometraje?, combustibleOctavos? (0–8), condicion?, observaciones?,
 *         inventario?: [{ item, presente, notas? }] | { item: "si"|"no" },
 *         forzarKilometraje?: "1" }
 *
 * Idempotent: re-submitting updates the note and moves `inspeccionAt`. Recording the odometer
 * also writes the unit's mileage history, in the same transaction.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const nota = await inspeccionarNota({ actor, id: params.id!, body });
		return json({ nota: publicNota(nota), faltantes: await faltantesInventario(nota.id) });
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
