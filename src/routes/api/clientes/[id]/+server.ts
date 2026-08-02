import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import {
	ClienteError,
	deleteCliente,
	getCliente,
	publicCliente,
	updateCliente,
} from "$lib/server/clientes";
import { listContactos } from "$lib/server/contactos";
import { listUnidades, publicUnidad } from "$lib/server/unidades";

/** GET /api/clientes/:id — customer with its contacts and units. Permission: `cliente:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "cliente:read");

	try {
		const cliente = await getCliente(params.id!);
		const [contactos, unidades] = await Promise.all([
			listContactos(cliente.id),
			listUnidades({ clienteId: cliente.id, archivados: true, perPage: 100 }),
		]);
		return json({ cliente: publicCliente(cliente), contactos, unidades: unidades.unidades });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/** PATCH /api/clientes/:id — update. Permission: `cliente:update`. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cliente = await updateCliente({ actor, id: params.id!, body });
		return json({ cliente: publicCliente(cliente) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * DELETE /api/clientes/:id — permanent, Admin only, for records created by mistake.
 * Refused while the customer owns units or appears in a unit's ownership history.
 * The normal path is POST /api/clientes/:id/archivar.
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const actor = requireUser(locals);

	try {
		const cliente = await deleteCliente({ actor, id: params.id! });
		return json({ deleted: { id: cliente.id, nombreCompleto: cliente.nombreCompleto } });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
