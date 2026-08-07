import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { conFlash } from "$lib/flash";
import { can } from "$lib/roles";
import { TRANSICIONES, requiereHora, type CitaEstado } from "$lib/citas";
import {
	actualizarCita,
	asignarCita,
	avanzarCita,
	cancelarCita,
	confirmarCita,
	datosParaVincular,
	getCita,
	publicCita,
	vincularCita,
} from "$lib/server/citas";
import prisma from "$lib/prisma";
import { crearNota } from "$lib/server/notas";
import { listContactos } from "$lib/server/contactos";
import { requirePermission, requireUser } from "$lib/server/guard";
import { listUsers } from "$lib/server/users";
import { fallaEnCarga, fallo } from "$lib/server/errores";

export const load: ServerLoad = async ({ locals, params, url }) => {
	const actor = requirePermission(locals, "cita:read");
	// `getCita` throws a 404 for an id that is not on file. Unguarded it escaped the load as an
	// unhandled error and came back a 500 — the right words with the wrong status, which is what a
	// crawler, a monitor and the browser's own cache all read instead of the sentence.
	const cita = publicCita(await getCita(params.id!).catch(fallaEnCarga));

	const asignables = can(actor.role, "cita:assign")
		? (await listUsers()).filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, roleLabel: u.roleLabel }))
		: [];

	// For the "vincular" drawer. Loaded server-side so it works with no JS, and through the shared
	// loader so the board's copy of the same drawer cannot drift from this one.
	// `?cliente=` lets the drawer preview another customer's units before saving.
	const puedeVincular = can(actor.role, "cita:update");
	const clienteElegido = url.searchParams.get("cliente") ?? cita.clienteId;
	const { clientes, unidades, sugeridas, entregadores } = puedeVincular
		? await datosParaVincular(cita, clienteElegido)
		: { clientes: [], unidades: [], sugeridas: [], entregadores: [] };

	// For the "recibir" drawer. Every live contact, not just the `entregador` ones: handing a
	// vehicle OVER carries no risk of releasing it to the wrong person, so it needs no authority —
	// that rule belongs to `entregarNota`, at the other end of the job.
	const contactos =
		can(actor.role, "nota:create") && cita.clienteId
			? (await listContactos(cita.clienteId)).map((c) => ({
					id: c.id,
					nombre: c.nombre,
					telefono: c.telefono,
					rolesLabel: c.rolesLabel,
				}))
			: [];

	// The last reading on file, so the intake field comes prefilled instead of being retyped off
	// a dashboard the operator is standing in front of anyway.
	const unidadActual = cita.unidadId
		? await prisma.unidad.findUnique({
				where: { id: cita.unidadId },
				select: { kilometraje: true },
			})
		: null;

	// An Operador advances only their own; anyone with cita:update advances anything.
	const puedeAvanzar =
		can(actor.role, "cita:advance") && (can(actor.role, "cita:update") || cita.asignadoId === actor.id);

	return {
		cita,
		asignables,
		clientes,
		unidades,
		sugeridas,
		entregadores,
		contactos,
		kilometrajeUnidad: unidadActual?.kilometraje ?? null,
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
		notaId:
			(await prisma.nota_servicio.findUnique({ where: { citaId: params.id! }, select: { id: true } }))?.id ??
			null,
	};
};

/** Every action routes through the same shared function the API route calls (Rule 4). */
export const actions: Actions = {
	editar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await actualizarCita({ actor, id: params.id!, body });
			redirect(303, conFlash(`/panel/citas/${params.id}`, "cita.editar"));
		} catch (err) {
			return fallo(err);
		}
	},

	/**
	 * The vehicle arrived: open its service note and land the operator IN the intake inspection.
	 *
	 * Receiving and inspecting are one continuous act at the counter — the person is standing next
	 * to the truck with the customer waiting. Dropping them on the note and making them find the
	 * button is how a unit gets moved into the bay with no walk-around on file, which is exactly
	 * what the inspection protects the shop from.
	 */
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
					entregoContactoId: data.get("entregoContactoId"),
					entregoNombre: data.get("entregoNombre"),
					entregoTelefono: data.get("entregoTelefono"),
				},
			});
			redirect(303, conFlash(`/panel/notas/${nota.id}?drawer=inspeccion`, "nota.recibir"));
		} catch (err) {
			return fallo(err);
		}
	},

	vincular: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await vincularCita({ actor, id: params.id!, body });
			redirect(303, conFlash(`/panel/citas/${params.id}`, "cita.vincular"));
		} catch (err) {
			return fallo(err);
		}
	},

	confirmar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await confirmarCita({ actor, id: params.id!, body });
			redirect(303, conFlash(`/panel/citas/${params.id}`, "cita.confirmar"));
		} catch (err) {
			return fallo(err);
		}
	},

	asignar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await asignarCita({ actor, id: params.id!, asignadoId: data.get("asignadoId") });
			redirect(303, conFlash(`/panel/citas/${params.id}`, "cita.asignar"));
		} catch (err) {
			return fallo(err);
		}
	},

	avanzar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await avanzarCita({ actor, id: params.id!, estado: data.get("estado") });
			redirect(303, conFlash(`/panel/citas/${params.id}`, "cita.avanzar"));
		} catch (err) {
			return fallo(err);
		}
	},

	cancelar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await cancelarCita({ actor, id: params.id!, motivo: data.get("motivo") });
			redirect(303, conFlash(`/panel/citas/${params.id}`, "cita.cancelar"));
		} catch (err) {
			return fallo(err);
		}
	},
};
