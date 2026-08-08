import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { crearTelefono, listTelefonos, publicTelefono } from "$lib/server/cliente-telefonos";

/** GET /api/clientes/:id/telefonos — Permission: `cliente:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "cliente:read");
	return json({ telefonos: await listTelefonos(params.id!) });
};

/**
 * POST /api/clientes/:id/telefonos — add a phone number to this customer.
 * Body: { telefono, etiqueta?, principal?: boolean }
 *
 * Needs `cliente:update`. The first phone a customer gets is always principal; after that,
 * `principal: true` demotes whichever one held it — see `crearTelefono`.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const telefono = await crearTelefono({ actor, clienteId: params.id!, body });
		return json({ telefono: publicTelefono(telefono) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
