/**
 * The notification event registry.
 *
 * One entry per thing worth telling somebody about. Safe to import from the browser: data and
 * pure functions only, no I/O — same shape as `audit-actions.ts` and `contacto-roles.ts`.
 *
 * ADDING AN EVENT? Add its key here in the same change that emits it. An unregistered key still
 * stores and delivers, it just renders as its raw key and cannot be switched off from the
 * preferences screen.
 *
 * Two audiences, and the split is load-bearing:
 *
 * - `empleado` — goes to staff inboxes. May say anything the shop knows.
 * - `cliente`  — goes to the customer. **Never names a partner taller**, in the title, the body
 *   or the deep link. Same rule `notaParaCliente` enforces on the tracking page: Estación 360
 *   sources the job out and is the one the customer holds responsible.
 */

import type { Permission } from "./roles";

export type Audiencia = "empleado" | "cliente";

/**
 * `directo` — one named recipient, decided at the emit site (the person a cita was assigned to).
 * `difusion` — everyone holding `permiso`. A permission, not a role list, so the audience for a
 * notification can never be wider than the audience for the screen it links to.
 */
export type Alcance = "directo" | "difusion";

export type EventoDef = {
	label: string;
	descripcion: string;
	audiencia: Audiencia;
	alcance: Alcance;
	/** Required for `difusion`; the fan-out is `everyone who can(role, permiso)`. */
	permiso?: Permission;
	icon: "calendar-days" | "car" | "clipboard-list" | "wrench" | "contact" | "list" | "scroll-text" | "package";
	/**
	 * Keeps the OS notification on screen until it is dismissed, instead of auto-hiding.
	 * Reserved for things that cost money or block a vehicle if they are missed.
	 */
	prioritario?: boolean;
};

export const NOTIFICACION_EVENTOS = {
	// --- Para el personal ----------------------------------------------------------------------
	cita_solicitada: {
		label: "Nueva solicitud de cita",
		descripcion: "Alguien pidió cita desde la página pública.",
		audiencia: "empleado",
		alcance: "difusion",
		permiso: "cita:read",
		icon: "calendar-days",
		prioritario: true,
	},
	cita_asignada: {
		label: "Me asignaron una cita",
		descripcion: "Te tocó atender o ir por una unidad.",
		audiencia: "empleado",
		alcance: "directo",
		icon: "calendar-days",
		prioritario: true,
	},
	nota_abierta: {
		label: "Llegó una unidad",
		descripcion: "Se abrió una nota de servicio.",
		audiencia: "empleado",
		alcance: "difusion",
		permiso: "nota:read",
		icon: "clipboard-list",
	},
	nota_taller_retorno: {
		label: "Regresó una unidad del taller aliado",
		descripcion: "Falta el control de calidad antes de seguir.",
		audiencia: "empleado",
		alcance: "difusion",
		permiso: "nota:read",
		icon: "wrench",
		prioritario: true,
	},
	nota_qa_rechazado: {
		label: "Control de calidad rechazado",
		descripcion: "El trabajo del taller aliado no pasó; la unidad se queda con ellos.",
		audiencia: "empleado",
		alcance: "difusion",
		permiso: "nota:read",
		icon: "wrench",
		prioritario: true,
	},
	cotizacion_respondida: {
		label: "El cliente respondió una cotización",
		descripcion: "La autorizó o la rechazó.",
		audiencia: "empleado",
		alcance: "difusion",
		permiso: "cotizacion:read",
		icon: "scroll-text",
		prioritario: true,
	},
	pago_registrado: {
		label: "Se registró un pago",
		descripcion: "Entró dinero contra una factura.",
		audiencia: "empleado",
		alcance: "difusion",
		permiso: "pago:read",
		icon: "scroll-text",
	},
	taller_solicitud: {
		label: "Un taller quiere certificarse",
		descripcion: "Llegó una solicitud desde la página pública de talleres.",
		audiencia: "empleado",
		alcance: "difusion",
		permiso: "taller:review",
		icon: "wrench",
	},
	refaccion_solicitada: {
		label: "Un mecánico pide una refacción",
		descripcion: "Hay que surtirla del inventario o decirle que no hay.",
		audiencia: "empleado",
		alcance: "difusion",
		permiso: "inventario:salida",
		icon: "package",
		prioritario: true,
	},
	refaccion_resuelta: {
		label: "Respondieron mi solicitud de refacción",
		descripcion: "Ya está lista para recoger, o no hay.",
		audiencia: "empleado",
		alcance: "directo",
		icon: "package",
	},
	nota_asignada: {
		label: "Me asignaron una unidad",
		descripcion: "Una nota de servicio quedó a tu nombre.",
		audiencia: "empleado",
		alcance: "directo",
		icon: "clipboard-list",
		prioritario: true,
	},
	trabajo_terminado: {
		label: "Un mecánico terminó su trabajo",
		descripcion: "La unidad ya se puede revisar y entregar.",
		audiencia: "empleado",
		alcance: "difusion",
		permiso: "nota:advance",
		icon: "clipboard-list",
		prioritario: true,
	},
	stock_bajo: {
		label: "Se acabó una refacción",
		descripcion: "Una pieza llegó a cero o bajó de su mínimo.",
		audiencia: "empleado",
		alcance: "difusion",
		permiso: "inventario:entrada",
		icon: "package",
	},
	aviso_manual: {
		label: "Aviso del equipo",
		descripcion: "Un mensaje que alguien te mandó a mano.",
		audiencia: "empleado",
		alcance: "directo",
		icon: "contact",
	},

	// --- Para el cliente -----------------------------------------------------------------------
	// Nothing below may name a partner taller. See notaParaCliente.
	cliente_cita_confirmada: {
		label: "Cita confirmada",
		descripcion: "Le confirmamos día y hora al cliente.",
		audiencia: "cliente",
		alcance: "directo",
		icon: "calendar-days",
	},
	cliente_unidad_recibida: {
		label: "Recibimos su unidad",
		descripcion: "La unidad llegó al taller y ya tiene nota de servicio.",
		audiencia: "cliente",
		alcance: "directo",
		icon: "car",
	},
	cliente_inspeccion: {
		label: "Terminamos la inspección",
		descripcion: "Ya hay fotos y estado de entrada.",
		audiencia: "cliente",
		alcance: "directo",
		icon: "clipboard-list",
	},
	cliente_cotizacion: {
		label: "Su cotización está lista",
		descripcion: "Hay un presupuesto esperando su respuesta.",
		audiencia: "cliente",
		alcance: "directo",
		icon: "scroll-text",
		prioritario: true,
	},
	cliente_avance: {
		label: "Avance de su servicio",
		descripcion: "Cambió el estado de la nota de servicio.",
		audiencia: "cliente",
		alcance: "directo",
		icon: "clipboard-list",
	},
	cliente_unidad_lista: {
		label: "Su unidad está lista",
		descripcion: "Ya se puede pasar por ella.",
		audiencia: "cliente",
		alcance: "directo",
		icon: "car",
		prioritario: true,
	},
	cliente_unidad_entregada: {
		label: "Entregamos su unidad",
		descripcion: "Acuse de que la unidad salió del taller.",
		audiencia: "cliente",
		alcance: "directo",
		icon: "car",
	},
	cliente_factura: {
		label: "Su factura",
		descripcion: "Se emitió una factura a su nombre.",
		audiencia: "cliente",
		alcance: "directo",
		icon: "scroll-text",
	},
	cliente_pago: {
		label: "Recibimos su pago",
		descripcion: "Acuse de un pago aplicado.",
		audiencia: "cliente",
		alcance: "directo",
		icon: "scroll-text",
	},
	cliente_comentario: {
		label: "Un mensaje del taller",
		descripcion: "Un comentario que el equipo marcó como visible para el cliente.",
		audiencia: "cliente",
		alcance: "directo",
		icon: "contact",
	},
} as const satisfies Record<string, EventoDef>;

export type NotificacionEvento = keyof typeof NOTIFICACION_EVENTOS;

export const NOTIFICACION_EVENTO_KEYS = Object.keys(NOTIFICACION_EVENTOS) as NotificacionEvento[];

export const isEvento = (v: unknown): v is NotificacionEvento =>
	typeof v === "string" && Object.hasOwn(NOTIFICACION_EVENTOS, v);

/** Events a person can switch on and off. Customer events are not in the preferences screen. */
export const EVENTOS_EMPLEADO = NOTIFICACION_EVENTO_KEYS.filter(
	(k) => NOTIFICACION_EVENTOS[k].audiencia === "empleado",
);

export const eventoLabel = (evento: string): string =>
	(NOTIFICACION_EVENTOS as Record<string, EventoDef>)[evento]?.label ?? evento;

export const eventoIcon = (evento: string): EventoDef["icon"] =>
	(NOTIFICACION_EVENTOS as Record<string, EventoDef>)[evento]?.icon ?? "list";

/**
 * "hace 5 min". Pure, no dependency, no locale database — `Intl.RelativeTimeFormat` would need a
 * unit decision anyway and this is four thresholds.
 */
export function haceCuanto(iso: string, ahora = new Date()): string {
	const seg = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 1000));
	if (seg < 60) return "hace un momento";
	const min = Math.round(seg / 60);
	if (min < 60) return `hace ${min} min`;
	const hrs = Math.round(min / 60);
	if (hrs < 24) return `hace ${hrs} h`;
	const dias = Math.round(hrs / 24);
	if (dias < 30) return `hace ${dias} d`;
	return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}
