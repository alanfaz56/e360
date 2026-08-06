import { fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { can } from "$lib/roles";
import { TRANSICIONES, requiereHora, type CitaEstado } from "$lib/citas";
import {
	CitaError,
	actualizarCita,
	asignarCita,
	avanzarCita,
	cancelarCita,
	confirmarCita,
	getCita,
	publicCita,
	vincularCita,
} from "$lib/server/citas";
import prisma from "$lib/prisma";
import { crearNota } from "$lib/server/notas";
import { listClientes } from "$lib/server/clientes";
import { listContactos } from "$lib/server/contactos";
import { listUnidades, sugerirUnidades } from "$lib/server/unidades";
import { requirePermission, requireUser } from "$lib/server/guard";
import { listUsers } from "$lib/server/users";

export const load: ServerLoad = async ({ locals, params, url }) => {
	const actor = requirePermission(locals, "cita:read");
	const cita = publicCita(await getCita(params.id!));

	const asignables = can(actor.role, "cita:assign")
		? (await listUsers())
				.filter((u) => u.active)
				.map((u) => ({ id: u.id, name: u.name, roleLabel: u.roleLabel }))
		: [];

	// For the "vincular" drawer: candidate customers, and — once one is chosen — its vehicles and
	// the contacts allowed to hand a unit over. Loaded server-side so the drawer works with no JS.
	const puedeVincular = can(actor.role, "cita:update");
	const clientes = puedeVincular
		? (await listClientes({ q: null, perPage: 100 })).clientes.map((c) => ({
				id: c.id,
				nombreCompleto: c.nombreCompleto,
				tipoLabel: c.tipoLabel,
			}))
		: [];

	// `?cliente=` lets the drawer preview another customer's units before saving.
	const clienteElegido = url.searchParams.get("cliente") ?? cita.clienteId;
	const unidades =
		puedeVincular && clienteElegido
			? (await listUnidades({ clienteId: clienteElegido, perPage: 100 })).unidades.map((u) => ({
					id: u.id,
					etiqueta: u.etiqueta,
					// `etiqueta` prefers placas, so a fleet's número económico would otherwise never
					// appear in the no-JS list — the one identifier they actually use.
					numeroEconomico: u.numeroEconomico,
					vin: u.vin,
					anio: u.anio,
					color: u.color,
					archivado: u.archivado,
				}))
			: [];

	// Vehicles already on file that match what this customer typed. Scoped to their fleet once a
	// customer is known; otherwise searched across every customer, which is how a returning
	// customer gets recognised from their plates — the owner comes with the vehicle.
	const sugeridas = puedeVincular
		? await sugerirUnidades({
				placas: cita.placas,
				marca: cita.marca,
				modelo: cita.modelo,
				clienteId: clienteElegido,
			})
		: [];
	const entregadores =
		puedeVincular && clienteElegido
			? (await listContactos(clienteElegido))
					.filter((c) => c.roles.includes("entregador"))
					.map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono }))
			: [];

	// An Operador advances only their own; anyone with cita:update advances anything.
	const puedeAvanzar =
		can(actor.role, "cita:advance") &&
		(can(actor.role, "cita:update") || cita.asignadoId === actor.id);

	return {
		cita,
		asignables,
		clientes,
		unidades,
		sugeridas,
		entregadores,
		clienteElegido,
		// Cancelling has its own permission and its own reason field, so it never shows up as
		// just another "next state" button. An estado that needs an hour is hidden until the
		// cita has one — the same rule avanzarCita enforces, so no button 500s.
		siguientes: (TRANSICIONES[cita.estado as CitaEstado] ?? []).filter(
			(e) => e !== "cancelada" && (cita.inicio !== null || !requiereHora(e)),
		),
		puede: {
			editar: puedeVincular,
			vincular: puedeVincular,
			cancelar: can(actor.role, "cita:cancel"),
			asignar: can(actor.role, "cita:assign"),
			avanzar: puedeAvanzar,
			// Who may open a colleague's profile and its numbers.
			verPerfil: can(actor.role, "user:stats"),
			recibir: can(actor.role, "nota:create"),
		},
		// At most one note per appointment, so this is either null or the one to jump to.
		notaId: (await prisma.nota_servicio.findUnique({ where: { citaId: params.id! }, select: { id: true } }))?.id ?? null,
	};
};

/** Every action routes through the same shared function the API route calls (Rule 4). */
export const actions: Actions = {
	editar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await actualizarCita({ actor, id: params.id!, body });
			redirect(303, `/panel/citas/${params.id}`);
		} catch (err) {
			if (err instanceof CitaError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	/** The vehicle arrived: open its service note and take the operator straight to it. */
	recibir: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			const nota = await crearNota({
				actor,
				body: {
					citaId: params.id,
					kilometraje: data.get("kilometraje"),
					forzarKilometraje: data.get("forzarKilometraje"),
					observaciones: data.get("observaciones"),
				},
			});
			redirect(303, `/panel/notas/${nota.id}`);
		} catch (err) {
			if (err instanceof CitaError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	vincular: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await vincularCita({ actor, id: params.id!, body });
			redirect(303, `/panel/citas/${params.id}`);
		} catch (err) {
			if (err instanceof CitaError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	confirmar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await confirmarCita({ actor, id: params.id!, body });
			redirect(303, `/panel/citas/${params.id}`);
		} catch (err) {
			if (err instanceof CitaError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	asignar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await asignarCita({ actor, id: params.id!, asignadoId: data.get("asignadoId") });
			redirect(303, `/panel/citas/${params.id}`);
		} catch (err) {
			if (err instanceof CitaError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	avanzar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await avanzarCita({ actor, id: params.id!, estado: data.get("estado") });
			redirect(303, `/panel/citas/${params.id}`);
		} catch (err) {
			if (err instanceof CitaError) return fail(err.status, { message: err.message });
			throw err;
		}
	},

	cancelar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await cancelarCita({ actor, id: params.id!, motivo: data.get("motivo") });
			redirect(303, `/panel/citas/${params.id}`);
		} catch (err) {
			if (err instanceof CitaError) return fail(err.status, { message: err.message });
			throw err;
		}
	},
};
