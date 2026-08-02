import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { deleteContacto, publicContacto, updateContacto } from "$lib/server/contactos";

/**
 * PATCH /api/contactos/:id — update a contact.
 *
 * Role changes are checked on the DELTA: editing the phone number of an existing
 * Entregador is allowed for anyone with `contacto:manage`, but adding or removing an
 * authority role needs `contacto:grant-authority`.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const contacto = await updateContacto({ actor, id: params.id!, body });
		return json({ contacto: publicContacto(contacto) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/** DELETE /api/contactos/:id — removing a contact that holds an authority role is itself an authority change. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const actor = requireUser(locals);

	try {
		const contacto = await deleteContacto({ actor, id: params.id! });
		return json({ deleted: { id: contacto.id, nombre: contacto.nombre } });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
