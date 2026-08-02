import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { listPropietarios, publicUnidad, transferUnidad } from "$lib/server/unidades";

/**
 * POST /api/unidades/:id/transferir — move a vehicle to another customer.
 * Body: { clienteId, motivo }
 *
 * Permission: `unidad:transfer` (Admin only). `motivo` is required and lands in the audit
 * entry, because a rare-but-serious move should always be explained.
 *
 * Service history stays with the unit; per-unit pickup authorizations from the previous
 * owner's contacts are revoked. See `transferUnidad`.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const unidad = await transferUnidad({
			actor,
			id: params.id!,
			clienteId: body.clienteId,
			motivo: body.motivo,
		});
		return json({ unidad: publicUnidad(unidad), propietarios: await listPropietarios(unidad.id) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
