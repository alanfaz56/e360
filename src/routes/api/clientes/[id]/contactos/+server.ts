import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { createContacto, listContactos, publicContacto } from "$lib/server/contactos";

/** GET /api/clientes/:id/contactos — Permission: `cliente:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "cliente:read");
	return json({ contactos: await listContactos(params.id!) });
};

/**
 * POST /api/clientes/:id/contactos — add a person to this customer.
 * Body: { nombre, telefono?, email?, identificacion?, notas?, roles?: string[],
 *         alcanceUnidades?: "todas"|"especificas", unidades?: string[] }
 *
 * Needs `contacto:manage`. Assigning `entregador` or `autorizador` additionally needs
 * `contacto:grant-authority` — enforced in `createContacto`, not here.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const contacto = await createContacto({ actor, clienteId: params.id!, body });
		return json({ contacto: publicContacto(contacto) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
