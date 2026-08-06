import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { NotaError, publicNota, recibirDeTaller } from "$lib/server/notas";

/**
 * POST /api/notas/[id]/recibir-taller — receive the unit back from a partner workshop, with QA.
 * Body: { qaResultado: "aprobado"|"con_detalles"|"rechazado", qaNotas?, resultado?, kilometraje? }
 * Permission: `nota:transfer`.
 *
 * This is the ONLY way out of `en_taller` — POST /estado refuses it — so the quality check cannot
 * be skipped. A rejected job keeps the transfer OPEN: the unit goes straight back, and releasing
 * it to the customer on a bad repair is the failure this step exists to prevent.
 *
 * `qaNotas` is required on a rejection: it is what gets claimed back from the partner shop.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const nota = await recibirDeTaller({
			actor,
			id: params.id!,
			qaResultado: body.qaResultado,
			qaNotas: body.qaNotas,
			resultado: body.resultado,
			kilometraje: body.kilometraje,
		});
		return json({ nota: publicNota(nota) });
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
