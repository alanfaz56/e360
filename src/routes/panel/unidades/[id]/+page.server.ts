import { type Actions, type ServerLoad } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { requirePermission, requireUser } from "$lib/server/guard";
import { historialKilometraje, historialUnidad } from "$lib/server/notas";
import { crearRecordatorio } from "$lib/server/recordatorios";
import {
	CAMPOS_FUSIONABLES_UNIDAD,
	getUnidad,
	listPropietarios,
	mergeUnidades,
	publicUnidad,
	setUnidadArchivada,
	transferUnidad,
	updateUnidad,
	type CampoFusionableUnidad,
} from "$lib/server/unidades";
import { fallaEnCarga, fallo } from "$lib/server/errores";

export const load: ServerLoad = async ({ locals, params, url }) => {
	const actor = requirePermission(locals, "unidad:read");

	let unidad;
	try {
		unidad = await getUnidad(params.id!);
	} catch (err) {
		fallaEnCarga(err);
	}

	const puedeTransferir = can(actor.role, "unidad:transfer");
	const puedeFusionar = can(actor.role, "unidad:merge");

	// Candidatas a duplicado: mismo VIN, mismas placas o mismo número económico, activas, que no
	// sean esta misma unidad. Sirve como lista inicial de EntitySearch y como <select> de
	// respaldo sin JS.
	const posiblesDuplicados = puedeFusionar
		? await prisma.unidad.findMany({
				where: {
					id: { not: unidad.id },
					archivedAt: null,
					OR: [
						...(unidad.vin ? [{ vin: unidad.vin }] : []),
						...(unidad.placas ? [{ placas: unidad.placas }] : []),
						...(unidad.numeroEconomico ? [{ numeroEconomico: unidad.numeroEconomico }] : []),
					],
				},
				select: {
					id: true,
					marca: true,
					modelo: true,
					anio: true,
					placas: true,
					vin: true,
					numeroEconomico: true,
					cliente: { select: { nombreCompleto: true } },
				},
				take: 10,
			})
		: [];

	// Paso 2 de fusionar: ya se eligió un duplicado, se cargan sus datos para el selector campo
	// por campo.
	const duplicadoId = url.searchParams.get("duplicado");
	let duplicado = null;
	if (puedeFusionar && duplicadoId && duplicadoId !== unidad.id) {
		try {
			duplicado = publicUnidad(await getUnidad(duplicadoId));
		} catch {
			// Un id inválido o ya borrado no debe tumbar la página — el drawer simplemente
			// vuelve al paso 1.
			duplicado = null;
		}
	}

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
		posiblesDuplicados: posiblesDuplicados.map((u) => ({
			id: u.id,
			marca: u.marca,
			modelo: u.modelo,
			anio: u.anio,
			placas: u.placas,
			vin: u.vin,
			numeroEconomico: u.numeroEconomico,
			clienteNombre: u.cliente.nombreCompleto,
		})),
		camposFusionables: CAMPOS_FUSIONABLES_UNIDAD,
		duplicado,
		puede: {
			editar: can(actor.role, "unidad:update"),
			archivar: can(actor.role, "unidad:archive"),
			transferir: puedeTransferir,
			verNotas: can(actor.role, "nota:read"),
			fusionar: puedeFusionar,
			recordar: can(actor.role, "recordatorio:manage"),
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
			return fallo(err);
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
			return fallo(err);
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
			return fallo(err);
		}
	},

	fusionar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		try {
			const camposElegidos = Object.fromEntries(
				CAMPOS_FUSIONABLES_UNIDAD.filter((campo) => form.get(`campo_${campo}`) === "duplicado").map((campo) => [
					campo,
					"duplicado",
				]),
			) as Partial<Record<CampoFusionableUnidad, "duplicado">>;
			const duplicado = await mergeUnidades({
				actor,
				keeperId: params.id!,
				duplicadoId: String(form.get("duplicadoId") ?? ""),
				motivo: form.get("motivo"),
				camposElegidos,
			});
			return { ok: `${duplicado.marca} ${duplicado.modelo} fusionada y archivada.` };
		} catch (err) {
			return fallo(err);
		}
	},

	agregarRecordatorio: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		try {
			await crearRecordatorio({
				actor,
				unidadId: params.id!,
				body: { motivo: form.get("motivo"), fecha: form.get("fecha") },
			});
			return { ok: "Recordatorio agregado." };
		} catch (err) {
			return fallo(err);
		}
	},
};
