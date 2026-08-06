import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { NotaError, publicNota, recibirDeTaller } from "$lib/server/notas";

/**
 * POST /api/notas/[id]/recibir-taller — receive the unit back from a partner workshop, with QA.
 * Body: { qaResultado: "aprobado"|"con_detalles"|"rechazado", destino?: "retrabajo"|"retorno",
 *         qaNotas?, resultado?, kilometraje? }
 * Permission: `nota:transfer`.
 *
 * This is the ONLY way out of `en_taller` — POST /estado refuses it — so the quality check cannot
 * be skipped.
 *
 * `destino` only decides anything on a rejection, and defaults to `retrabajo` (the shop keeps the
 * unit and owes the fix). `retorno` recovers it so it can be finished in-house or sent to a
 * different shop — a rejection is a verdict on the WORK, not a sentence to that workshop.
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
			destino: body.destino,
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
