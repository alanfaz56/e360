import { type Actions, type ServerLoad } from "@sveltejs/kit";
import { CONTACTO_ROLES } from "$lib/contacto-roles";
import { assignableContactoRoles, can } from "$lib/roles";
import { requirePermission, requireUser } from "$lib/server/guard";
import {
	CAMPOS_FUSIONABLES,
	CLIENTE_TIPOS,
	CLIENTE_TIPO_LABEL,
	getCliente,
	mergeClientes,
	publicCliente,
	setClienteArchivado,
	updateCliente,
	type CampoFusionable,
} from "$lib/server/clientes";
import prisma from "$lib/prisma";
import { createContacto, deleteContacto, listContactos, updateContacto } from "$lib/server/contactos";
import { actualizarTelefono, crearTelefono, eliminarTelefono, listTelefonos } from "$lib/server/cliente-telefonos";
import { createUnidad, listUnidades } from "$lib/server/unidades";
import { fallaEnCarga, fallo } from "$lib/server/errores";

export const load: ServerLoad = async ({ locals, params, url }) => {
	const actor = requirePermission(locals, "cliente:read");

	let cliente;
	try {
		cliente = await getCliente(params.id!);
	} catch (err) {
		fallaEnCarga(err);
	}

	const [contactos, telefonos, unidades] = await Promise.all([
		listContactos(cliente.id),
		listTelefonos(cliente.id),
		listUnidades({ clienteId: cliente.id, archivados: true, perPage: 100 }),
	]);

	const puedeFusionar = can(actor.role, "cliente:merge");

	// Candidatos a duplicado: mismo teléfono (principal o secundario) o mismo nombre, activos,
	// que no sean este mismo cliente. Sirve como lista inicial de EntitySearch y como <select>
	// de respaldo sin JS.
	const misTelefonos = [cliente.telefono, ...telefonos.map((t) => t.telefono)].filter(
		(v): v is string => typeof v === "string" && v !== "",
	);
	const posiblesDuplicados = puedeFusionar
		? await prisma.cliente.findMany({
				where: {
					id: { not: cliente.id },
					archivedAt: null,
					OR: [
						...(misTelefonos.length > 0 ? [{ telefono: { in: misTelefonos } }] : []),
						...(misTelefonos.length > 0
							? [{ telefonos: { some: { telefono: { in: misTelefonos }, archivedAt: null } } }]
							: []),
						{ nombreCompleto: cliente.nombreCompleto },
					],
				},
				select: { id: true, nombreCompleto: true, tipo: true, telefono: true, rfc: true },
				take: 10,
			})
		: [];

	// Paso 2 de fusionar: ya se eligió un duplicado, se cargan sus datos, contactos y teléfonos
	// para el selector lado a lado.
	const duplicadoId = url.searchParams.get("duplicado");
	let duplicado = null;
	if (puedeFusionar && duplicadoId && duplicadoId !== cliente.id) {
		try {
			const dup = await getCliente(duplicadoId);
			duplicado = {
				cliente: publicCliente(dup),
				contactos: dup.archivedAt ? [] : await listContactos(dup.id),
				telefonos: dup.archivedAt ? [] : await listTelefonos(dup.id),
			};
		} catch {
			// Un id inválido o ya borrado no debe tumbar la página — el drawer simplemente
			// vuelve al paso 1.
			duplicado = null;
		}
	}

	return {
		cliente: publicCliente(cliente),
		contactos,
		telefonos,
		camposFusionables: CAMPOS_FUSIONABLES,
		unidades: unidades.unidades,
		tipos: CLIENTE_TIPOS.map((value) => ({ value, label: CLIENTE_TIPO_LABEL[value] })),
		// Only the roles this actor may actually hand out reach the browser.
		rolesDisponibles: assignableContactoRoles(actor.role).map((value) => ({
			value,
			label: CONTACTO_ROLES[value].label,
			descripcion: CONTACTO_ROLES[value].descripcion,
			autoridad: CONTACTO_ROLES[value].autoridad,
		})),
		posiblesDuplicados: posiblesDuplicados.map((c) => ({
			id: c.id,
			nombreCompleto: c.nombreCompleto,
			tipoLabel: CLIENTE_TIPO_LABEL[c.tipo as keyof typeof CLIENTE_TIPO_LABEL] ?? c.tipo,
			telefono: c.telefono,
			rfc: c.rfc,
		})),
		duplicado,
		puede: {
			editar: can(actor.role, "cliente:update"),
			archivar: can(actor.role, "cliente:archive"),
			contactos: can(actor.role, "contacto:manage"),
			otorgarAutoridad: can(actor.role, "contacto:grant-authority"),
			crearUnidad: can(actor.role, "unidad:create"),
			fusionar: puedeFusionar,
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
			return fallo(err);
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
			return fallo(err);
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
			return fallo(err);
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
			return fallo(err);
		}
	},

	eliminarContacto: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		try {
			await deleteContacto({ actor, id: String(form.get("contactoId") ?? "") });
			return { ok: "Contacto eliminado." };
		} catch (err) {
			return fallo(err);
		}
	},

	agregarTelefono: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await crearTelefono({ actor, clienteId: params.id!, body });
			return { ok: "Teléfono agregado." };
		} catch (err) {
			return fallo(err);
		}
	},

	marcarPrincipal: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		try {
			await actualizarTelefono({ actor, id: String(form.get("telefonoId") ?? ""), body: { principal: true } });
			return { ok: "Teléfono marcado como principal." };
		} catch (err) {
			return fallo(err);
		}
	},

	eliminarTelefono: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		try {
			await eliminarTelefono({ actor, id: String(form.get("telefonoId") ?? "") });
			return { ok: "Teléfono eliminado." };
		} catch (err) {
			return fallo(err);
		}
	},

	crearUnidad: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await createUnidad({ actor, clienteId: params.id!, body });
			return { ok: "Unidad registrada." };
		} catch (err) {
			return fallo(err);
		}
	},

	fusionar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		try {
			const camposElegidos = Object.fromEntries(
				CAMPOS_FUSIONABLES.filter((campo) => form.get(`campo_${campo}`) === "duplicado").map((campo) => [
					campo,
					"duplicado",
				]),
			) as Partial<Record<CampoFusionable, "duplicado">>;
			const duplicado = await mergeClientes({
				actor,
				keeperId: params.id!,
				duplicadoId: String(form.get("duplicadoId") ?? ""),
				motivo: form.get("motivo"),
				contactosAConservar: form.getAll("contactosAConservar").map(String),
				telefonosAConservar: form.getAll("telefonosAConservar").map(String),
				crearContactoDelDuplicado: form.get("crearContactoDelDuplicado") === "on",
				camposElegidos,
			});
			return { ok: `${duplicado.nombreCompleto} fusionado y archivado.` };
		} catch (err) {
			return fallo(err);
		}
	},
};
