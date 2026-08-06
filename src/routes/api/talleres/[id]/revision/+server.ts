import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requireUser } from "$lib/server/guard";
import { revisarTaller } from "$lib/server/talleres";

/**
 * POST /api/talleres/[id]/revision — certify or turn down an application. `taller:review`.
 *
 * Body: `{ estado: "aprobado" | "rechazado", motivo? }`. A rejection must carry a motivo; it is
 * what gets read back to the shop, and `taller_rechazo_motivo_check` enforces it in the database
 * as well.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

	try {
		const taller = await revisarTaller({
			actor,
			id: params.id!,
			estado: String(body.estado ?? ""),
			motivo: body.motivo,
		});
		return json({ taller });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
