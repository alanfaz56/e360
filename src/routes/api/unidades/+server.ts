import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { createUnidad, listUnidades, parseUnidadQuery, publicUnidad } from "$lib/server/unidades";

/**
 * GET /api/unidades — global vehicle search. Permission: `unidad:read`.
 * `q` matches placas, VIN, número económico, marca, modelo and the owner's name — this is
 * the counter's entry point when a vehicle arrives and you only have the plate.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "unidad:read");
	return json(await listUnidades(parseUnidadQuery(url.searchParams)));
};

/**
 * POST /api/unidades — register a vehicle against a customer.
 * Body: { clienteId, marca, modelo, anio?, color?, placas?, vin?, numeroEconomico?,
 *         kilometraje?, notas? }
 * Only marca and modelo are required, so a car can be received in seconds.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	if (typeof body.clienteId !== "string" || !body.clienteId) error(400, "Se requiere `clienteId`");

	try {
		const unidad = await createUnidad({ actor, clienteId: body.clienteId, body });
		return json({ unidad: publicUnidad(unidad) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
