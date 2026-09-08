import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { can } from "$lib/roles";
import { conFlash } from "$lib/flash";
import { listContactos } from "$lib/server/contactos";
import {
	actualizarCotizacion,
	cambiarEstadoCotizacion,
	getCotizacion,
	publicCotizacion,
	reenviarCotizacionCorreo,
	utilidadDeCotizacion,
} from "$lib/server/comercial";
import { fallaEnCarga, fallo } from "$lib/server/errores";
import { requirePermission, requireUser } from "$lib/server/guard";
import { listProductos } from "$lib/server/productos";

export const load: ServerLoad = async ({ locals, params }) => {
	const actor = requirePermission(locals, "cotizacion:read");
	try {
		const fila = await getCotizacion(params.id!);
		const [contactos, productos, utilidad] = await Promise.all([
			can(actor.role, "cotizacion:authorize") ? listContactos(fila.clienteId) : [],
			can(actor.role, "cotizacion:create") && can(actor.role, "producto:read")
				? listProductos({ perPage: 200 })
				: null,
			can(actor.role, "cotizacion:costo") ? utilidadDeCotizacion(actor, fila.id) : null,
		]);
		return {
			cotizacion: publicCotizacion(fila),
			contactos: contactos.filter((c) => !c.archivado && c.roles.includes("autorizador")),
			productos: productos?.productos ?? [],
			utilidad,
			puede: {
				editar: can(actor.role, "cotizacion:create"),
				enviar: can(actor.role, "cotizacion:send"),
				autorizar: can(actor.role, "cotizacion:authorize"),
				agendar: can(actor.role, "cita:create"),
				verUtilidad: can(actor.role, "cotizacion:costo"),
			},
		};
	} catch (err) {
		fallaEnCarga(err);
	}
};

const conceptosDe = (data: FormData) =>
	data
		.getAll("tipo")
		.map((tipo, i) => ({
			tipo,
			descripcion: data.getAll("descripcion")[i],
			cantidad: data.getAll("cantidad")[i],
			precioUnitario: data.getAll("precioUnitario")[i],
			productoId: data.getAll("productoId")[i],
		}))
		.filter((c) => String(c.descripcion ?? "").trim() !== "" || String(c.productoId ?? "").trim() !== "");

export const actions: Actions = {
	/** Replace the draft's lines; the shared service enforces the immutable-after-send rule. */
	actualizar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await actualizarCotizacion({
				actor,
				id: params.id!,
				body: {
					conceptos: conceptosDe(data),
					vigenciaHasta: data.get("vigenciaHasta"),
					notas: data.get("notas"),
				},
			});
			redirect(303, conFlash(`/panel/cotizaciones/${params.id}`, "cotizacion.editar"));
		} catch (err) {
			return fallo(err);
		}
	},

	estado: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		const estado = data.get("estado");
		try {
			await cambiarEstadoCotizacion({
				actor,
				id: params.id!,
				estado,
				body: { contactoId: data.get("contactoId"), medio: data.get("medio"), motivo: data.get("motivo") },
			});
			redirect(
				303,
				conFlash(`/panel/cotizaciones/${params.id}`, estado === "enviada" ? "cotizacion.enviada" : "cotizacion.estado"),
			);
		} catch (err) {
			return fallo(err);
		}
	},

	reenviar: async ({ locals, params }) => {
		const actor = requireUser(locals);
		try {
			await reenviarCotizacionCorreo({ actor, id: params.id! });
			redirect(303, conFlash(`/panel/cotizaciones/${params.id}`, "cotizacion.reenviar"));
		} catch (err) {
			return fallo(err);
		}
	},
};
