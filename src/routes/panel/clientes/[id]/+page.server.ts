import { error, fail, type Actions, type ServerLoad } from "@sveltejs/kit";
import { CONTACTO_ROLES } from "$lib/contacto-roles";
import { assignableContactoRoles, can } from "$lib/roles";
import { requirePermission, requireUser } from "$lib/server/guard";
import {
	CLIENTE_TIPOS,
	CLIENTE_TIPO_LABEL,
	ClienteError,
	getCliente,
	publicCliente,
	setClienteArchivado,
	updateCliente,
} from "$lib/server/clientes";
import { createContacto, deleteContacto, listContactos, updateContacto } from "$lib/server/contactos";
import { createUnidad, listUnidades } from "$lib/server/unidades";

export const load: ServerLoad = async ({ locals, params }) => {
	const actor = requirePermission(locals, "cliente:read");

	let cliente;
	try {
		cliente = await getCliente(params.id!);
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}

	const [contactos, unidades] = await Promise.all([
		listContactos(cliente.id),
		listUnidades({ clienteId: cliente.id, archivados: true, perPage: 100 }),
	]);

	return {
		cliente: publicCliente(cliente),
		contactos,
		unidades: unidades.unidades,
		tipos: CLIENTE_TIPOS.map((value) => ({ value, label: CLIENTE_TIPO_LABEL[value] })),
		// Only the roles this actor may actually hand out reach the browser.
		rolesDisponibles: assignableContactoRoles(actor.role).map((value) => ({
			value,
			label: CONTACTO_ROLES[value].label,
			descripcion: CONTACTO_ROLES[value].descripcion,
			autoridad: CONTACTO_ROLES[value].autoridad,
		})),
		puede: {
			editar: can(actor.role, "cliente:update"),
			archivar: can(actor.role, "cliente:archive"),
			contactos: can(actor.role, "contacto:manage"),
			otorgarAutoridad: can(actor.role, "contacto:grant-authority"),
			crearUnidad: can(actor.role, "unidad:create"),
		},
	};
};

/** Every action routes through the shared server functions — same rules as the JSON API. */
export const actions: Actions = {
	editar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await updateCliente({ actor, id: params.id!, body });
			return { ok: "Cliente actualizado." };
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	archivar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		try {
			const cliente = await setClienteArchivado({
				actor,
				id: params.id!,
				archivado: form.get("archivado") === "true",
			});
			return { ok: cliente.archivedAt ? "Cliente archivado." : "Cliente restaurado." };
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	crearContacto: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		try {
			await createContacto({
				actor,
				clienteId: params.id!,
				body: {
					...Object.fromEntries(form),
					// Checkbox groups: getAll, not get, or only the last one survives.
					roles: form.getAll("roles"),
					unidades: form.getAll("unidades"),
				},
			});
			return { ok: "Contacto agregado." };
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	editarContacto: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		try {
			await updateContacto({
				actor,
				id: String(form.get("contactoId") ?? ""),
				body: {
					...Object.fromEntries(form),
					roles: form.getAll("roles"),
					unidades: form.getAll("unidades"),
				},
			});
			return { ok: "Contacto actualizado." };
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	eliminarContacto: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		try {
			await deleteContacto({ actor, id: String(form.get("contactoId") ?? "") });
			return { ok: "Contacto eliminado." };
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	crearUnidad: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await createUnidad({ actor, clienteId: params.id!, body });
			return { ok: "Unidad registrada." };
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},
};
