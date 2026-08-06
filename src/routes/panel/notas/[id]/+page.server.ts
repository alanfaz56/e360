import { fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { NOTA_TRANSICIONES, type NotaEstado } from "$lib/notas";
import { can } from "$lib/roles";
import { ClienteError } from "$lib/server/clientes";
import { listContactos } from "$lib/server/contactos";
import { listTalleres } from "$lib/server/talleres";
import { requirePermission, requireUser } from "$lib/server/guard";
import { r2Configurado } from "$lib/server/r2";
import {
	avanzarNota,
	cancelarNota,
	comentarNota,
	entregarNota,
	faltantesInventario,
	getNotaDetalle,
	inspeccionarNota,
	recibirDeTaller,
	transferirNota,
} from "$lib/server/notas";
import { listCotizaciones, listFacturas, saldoCliente } from "$lib/server/comercial";

export const load: ServerLoad = async ({ locals, params }) => {
	const actor = requirePermission(locals, "nota:read");
	const detalle = await getNotaDetalle(params.id!);
	const { nota } = detalle;

	const [talleres, contactos, faltantes, cotizaciones, facturas, credito] = await Promise.all([
		can(actor.role, "taller:read")
			? (await listTalleres({ perPage: 100 })).talleres.filter((t) => !t.archivado)
			: [],
		listContactos(nota.clienteId),
		faltantesInventario(nota.id),
		can(actor.role, "cotizacion:read") ? listCotizaciones({ notaId: nota.id, perPage: 50 }) : null,
		can(actor.role, "factura:read") ? listFacturas({ notaId: nota.id, perPage: 50 }) : null,
		can(actor.role, "factura:read") ? saldoCliente(nota.clienteId) : null,
	]);

	// `saldoCents`/`limiteCents` are internal bigints and must not cross to the browser.
	const creditoPublico = credito
		? (({ saldoCents: _s, limiteCents: _l, ...resto }) => resto)(credito)
		: null;

	return {
		...detalle,
		talleres,
		// Only contacts who may actually receive the unit; the server re-checks the same rule.
		entregadores: contactos
			.filter((c) => c.roles.includes("entregador"))
			.map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono })),
		autorizadores: contactos
			.filter((c) => c.roles.includes("autorizador"))
			.map((c) => ({ id: c.id, nombre: c.nombre })),
		faltantes,
		cotizaciones: cotizaciones?.cotizaciones ?? [],
		facturas: facturas?.facturas ?? [],
		credito: creditoPublico,
		r2: r2Configurado(),
		// Estados reachable from here through the plain "advance" action. Transfer, delivery and
		// cancellation are excluded on purpose: each needs more than a status.
		siguientes: (NOTA_TRANSICIONES[nota.estado as NotaEstado] ?? []).filter(
			(e) => e !== "cancelada" && e !== "entregada" && e !== "en_taller",
		),
		puede: {
			inspeccionar: can(actor.role, "nota:inspect"),
			avanzar: can(actor.role, "nota:advance"),
			transferir: can(actor.role, "nota:transfer"),
			comentar: can(actor.role, "nota:comment"),
			entregar: can(actor.role, "nota:close"),
			cancelar: can(actor.role, "nota:cancel"),
			cotizar: can(actor.role, "cotizacion:create"),
			facturar: can(actor.role, "factura:create"),
			cobrar: can(actor.role, "pago:register"),
			verDinero: can(actor.role, "factura:read"),
		},
	};
};

const problema = (err: unknown) => {
	if (err instanceof ClienteError) return fail(err.status, { message: err.message });
	throw err;
};

/** Every action routes through the same shared function the API route calls (Rule 4). */
export const actions: Actions = {
	inspeccionar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		const body = Object.fromEntries(data) as Record<string, unknown>;
		// Checkboxes only post when checked, so an unchecked box means "not present" rather than
		// "not answered" — the form always submits the full catalogue via hidden fields.
		body.inventario = Object.fromEntries(
			data.getAll("inventarioItem").map((k) => [String(k), data.getAll("inventario").includes(String(k)) ? "si" : "no"]),
		);
		try {
			await inspeccionarNota({ actor, id: params.id!, body });
			redirect(303, `/panel/notas/${params.id}`);
		} catch (err) {
			return problema(err);
		}
	},

	avanzar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await avanzarNota({ actor, id: params.id!, estado: data.get("estado") });
			redirect(303, `/panel/notas/${params.id}`);
		} catch (err) {
			return problema(err);
		}
	},

	/** The unit came back from a partner shop — QA is what closes the transfer. */
	recibirTaller: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await recibirDeTaller({
				actor,
				id: params.id!,
				qaResultado: data.get("qaResultado"),
				qaNotas: data.get("qaNotas"),
				resultado: data.get("resultado"),
				kilometraje: data.get("kilometraje"),
			});
			redirect(303, `/panel/notas/${params.id}`);
		} catch (err) {
			return problema(err);
		}
	},

	transferir: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await transferirNota({
				actor,
				id: params.id!,
				tallerId: data.get("tallerId"),
				motivo: data.get("motivo"),
			});
			redirect(303, `/panel/notas/${params.id}`);
		} catch (err) {
			return problema(err);
		}
	},

	comentar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await comentarNota({
				actor,
				id: params.id!,
				texto: data.get("texto"),
				interno: data.get("interno") === "1",
			});
			redirect(303, `/panel/notas/${params.id}`);
		} catch (err) {
			return problema(err);
		}
	},

	entregar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await entregarNota({
				actor,
				id: params.id!,
				contactoId: data.get("contactoId"),
				observaciones: data.get("observaciones"),
			});
			redirect(303, `/panel/notas/${params.id}`);
		} catch (err) {
			return problema(err);
		}
	},

	cancelar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await cancelarNota({ actor, id: params.id!, motivo: data.get("motivo") });
			redirect(303, `/panel/notas/${params.id}`);
		} catch (err) {
			return problema(err);
		}
	},
};
