import { error, fail, type Actions, type ServerLoad } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { historialKilometraje, historialUnidad } from "$lib/server/notas";
import {
	getUnidad,
	listPropietarios,
	publicUnidad,
	setUnidadArchivada,
	transferUnidad,
	updateUnidad,
} from "$lib/server/unidades";

export const load: ServerLoad = async ({ locals, params }) => {
	const actor = requirePermission(locals, "unidad:read");

	let unidad;
	try {
		unidad = await getUnidad(params.id!);
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}

	const puedeTransferir = can(actor.role, "unidad:transfer");

	const [propietarios, historial, kilometraje, contactos] = await Promise.all([
		listPropietarios(unidad.id),
		can(actor.role, "nota:read") ? historialUnidad(unidad.id) : null,
		historialKilometraje(unidad.id),
		// The customer's own people who may act on THIS vehicle: everyone with a customer-wide
		// scope, plus anyone authorised for this unit specifically.
		prisma.cliente_contacto.findMany({
			where: {
				clienteId: unidad.clienteId,
				archivedAt: null,
				OR: [{ alcanceUnidades: "todas" }, { unidadesAutorizadas: { some: { unidadId: unidad.id } } }],
			},
			orderBy: { nombre: "asc" },
			select: { id: true, nombre: true, telefono: true, roles: true, alcanceUnidades: true },
		}),
	]);

	return {
		unidad: publicUnidad(unidad),
		propietarios,
		historial,
		kilometraje,
		contactos,
		// Only loaded when the transfer drawer could actually be used.
		clientes: puedeTransferir
			? (
					await prisma.cliente.findMany({
						where: { archivedAt: null, NOT: { id: unidad.clienteId } },
						orderBy: { nombreCompleto: "asc" },
						select: { id: true, nombreCompleto: true },
						take: 500,
					})
				).map((c) => ({ id: c.id, nombre: c.nombreCompleto }))
			: [],
		puede: {
			editar: can(actor.role, "unidad:update"),
			archivar: can(actor.role, "unidad:archive"),
			transferir: puedeTransferir,
			verNotas: can(actor.role, "nota:read"),
		},
	};
};

export const actions: Actions = {
	editar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await updateUnidad({ actor, id: params.id!, body });
			return { ok: "Unidad actualizada." };
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	archivar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		try {
			const unidad = await setUnidadArchivada({
				actor,
				id: params.id!,
				archivado: form.get("archivado") === "true",
			});
			return { ok: unidad.archivedAt ? "Unidad archivada." : "Unidad restaurada." };
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	/** Same rules as POST /api/unidades/:id/transferir — both call `transferUnidad`. */
	transferir: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		try {
			await transferUnidad({
				actor,
				id: params.id!,
				clienteId: form.get("clienteId"),
				motivo: form.get("motivo"),
			});
			return { ok: "Unidad transferida. Se revocaron las autorizaciones del dueño anterior." };
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},
};
