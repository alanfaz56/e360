import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { enZona, hoy, sumarDias } from "$lib/agenda";
import { NOTA_ESTADOS_ABIERTOS } from "$lib/notas";
import { pesos } from "$lib/comercial";
import { whereSinAtender, whereSinProcesar } from "./citas";
import type { Actor } from "./guard";

/**
 * The home dashboard's numbers, per role.
 *
 * Every block is gated by the permission of the DATA it summarises, not by a new "reports"
 * permission — a KPI is just a count of rows somebody can already list, so inventing a separate
 * key would let the two drift apart and eventually leak a number the role cannot open.
 *
 * Each card carries its own `href`, because a number nobody can act on is decoration. Every one
 * of them lands on a filtered list that explains it.
 */

export type Kpi = {
	clave: string;
	label: string;
	valor: number | string;
	hint?: string | null;
	href?: string | null;
	tone?: "neutral" | "brand" | "ok" | "warn" | "danger";
	icon?: "calendar-days" | "car" | "clipboard-list" | "wrench" | "contact" | "list";
};

export type BloqueKpi = { titulo: string; kpis: Kpi[] };

/**
 * Appointments that were let go: a request nobody confirmed, or a confirmed slot nobody
 * processed. Split because they are two different failures with two different follow-ups.
 */
export async function resumenVencidas() {
	const [sinAtender, sinProcesar] = await Promise.all([
		prisma.cita.count({ where: whereSinAtender() }),
		prisma.cita.count({ where: whereSinProcesar() }),
	]);
	return { sinAtender, sinProcesar, total: sinAtender + sinProcesar };
}

export async function kpisPara(actor: Actor): Promise<BloqueKpi[]> {
	const bloques: BloqueKpi[] = [];
	const dia = enZona(hoy());
	const finSemana = enZona(sumarDias(hoy(), 7));

	// --- Lo mío -------------------------------------------------------------------------------
	// An Operador opens the panel to find out what THEY have to do today, so their own numbers
	// come first — for everyone, not just Operadores.
	if (can(actor.role, "cita:read")) {
		const [misHoy, misSemana, misRecolecciones] = await Promise.all([
			prisma.cita.count({
				where: { asignadoId: actor.id, fecha: dia, estado: { notIn: ["cancelada", "completada"] } },
			}),
			prisma.cita.count({
				where: {
					asignadoId: actor.id,
					fecha: { gte: dia, lte: finSemana },
					estado: { notIn: ["cancelada", "completada"] },
				},
			}),
			prisma.cita.count({
				where: {
					asignadoId: actor.id,
					tipo: "recoleccion",
					fecha: dia,
					estado: { notIn: ["cancelada", "completada"] },
				},
			}),
		]);

		bloques.push({
			titulo: "Lo mío",
			kpis: [
				{
					clave: "mis_citas_hoy",
					label: "Mis citas de hoy",
					valor: misHoy,
					href: `/panel/agenda?mias=1&vista=dia&fecha=${hoy()}`,
					icon: "calendar-days",
					tone: misHoy > 0 ? "brand" : "neutral",
				},
				{
					clave: "mis_recolecciones",
					label: "Recolecciones hoy",
					valor: misRecolecciones,
					hint: misRecolecciones > 0 ? "Hay que ir por ellas" : null,
					href: "/panel/citas?mias=1&tipo=recoleccion",
					icon: "car",
				},
				{
					clave: "mis_citas_semana",
					label: "Mis próximos 7 días",
					valor: misSemana,
					href: "/panel/agenda?mias=1",
					icon: "list",
				},
			],
		});
	}

	// --- Ventas que se están escapando --------------------------------------------------------
	if (can(actor.role, "cita:read")) {
		const [vencidas, solicitudes] = await Promise.all([
			resumenVencidas(),
			prisma.cita.count({ where: { estado: "solicitada" } }),
		]);

		bloques.push({
			titulo: "Ventas por recuperar",
			kpis: [
				{
					clave: "solicitudes_sin_atender",
					label: "Solicitudes sin atender",
					valor: vencidas.sinAtender,
					hint: vencidas.sinAtender > 0 ? "Pidieron cita y ya pasó el día" : "Nada rezagado",
					href: "/panel/citas?vencidas=1&estado=solicitada",
					tone: vencidas.sinAtender > 0 ? "danger" : "ok",
				},
				{
					clave: "citas_sin_procesar",
					label: "Citas sin procesar",
					valor: vencidas.sinProcesar,
					hint: vencidas.sinProcesar > 0 ? "Pasó su hora y siguen abiertas" : "Al corriente",
					href: "/panel/citas?vencidas=1&estado=confirmada",
					tone: vencidas.sinProcesar > 0 ? "warn" : "ok",
				},
				{
					clave: "solicitudes_pendientes",
					label: "Solicitudes por confirmar",
					valor: solicitudes,
					href: "/panel/citas?estado=solicitada",
					tone: solicitudes > 0 ? "warn" : "neutral",
				},
			],
		});
	}

	// --- El taller ahora ----------------------------------------------------------------------
	if (can(actor.role, "nota:read")) {
		const [abiertas, sinInspeccion, enTaller, listas] = await Promise.all([
			prisma.nota_servicio.count({ where: { estado: { in: NOTA_ESTADOS_ABIERTOS } } }),
			prisma.nota_servicio.count({
				where: { estado: { in: NOTA_ESTADOS_ABIERTOS }, inspeccionAt: null },
			}),
			prisma.nota_servicio.count({ where: { estado: "en_taller" } }),
			prisma.nota_servicio.count({ where: { estado: "lista" } }),
		]);

		bloques.push({
			titulo: "En el taller",
			kpis: [
				{
					clave: "notas_abiertas",
					label: "Unidades en piso",
					valor: abiertas,
					href: "/panel/notas?abiertas=1",
					icon: "clipboard-list",
					tone: "brand",
				},
				{
					clave: "sin_inspeccion",
					label: "Sin inspección",
					valor: sinInspeccion,
					hint: sinInspeccion > 0 ? "Levántala antes de mover la unidad" : "Todas inspeccionadas",
					href: "/panel/notas?abiertas=1",
					tone: sinInspeccion > 0 ? "warn" : "ok",
				},
				{
					clave: "en_taller_aliado",
					label: "En taller aliado",
					valor: enTaller,
					hint: enTaller > 0 ? "Pendientes de recibir con calidad" : null,
					href: "/panel/notas?estado=en_taller",
					icon: "wrench",
				},
				{
					clave: "listas_entrega",
					label: "Listas para entrega",
					valor: listas,
					hint: listas > 0 ? "Hay que avisarle al cliente" : null,
					href: "/panel/notas?estado=lista",
					tone: listas > 0 ? "ok" : "neutral",
				},
			],
		});
	}

	// --- Dinero -------------------------------------------------------------------------------
	// Gated on `factura:create`, NOT `factura:read`. An Operador holds `factura:read` because they
	// take payments at the counter and need to open the invoice in front of them — that is not the
	// same as seeing what the whole shop is owed. Company-wide receivables belong to whoever
	// actually issues invoices, which is exactly what `factura:create` already means.
	if (can(actor.role, "factura:create")) {
		const ahora = new Date();
		const [porCobrar, vencidas, cotizacionesEnviadas] = await Promise.all([
			prisma.factura.findMany({
				where: { estado: "emitida" },
				select: { total: true, pagos: { select: { monto: true } } },
			}),
			prisma.factura.count({ where: { estado: "emitida", vence: { lt: ahora } } }),
			prisma.cotizacion.count({ where: { estado: "enviada" } }),
		]);

		let saldo = 0n;
		for (const f of porCobrar) {
			const pagado = f.pagos.reduce((s, p) => s + BigInt(Math.round(Number(p.monto) * 100)), 0n);
			saldo += BigInt(Math.round(Number(f.total) * 100)) - pagado;
		}

		bloques.push({
			titulo: "Cobranza",
			kpis: [
				{
					clave: "por_cobrar",
					label: "Por cobrar",
					valor: `$${pesos(saldo)}`,
					hint: `${porCobrar.length} factura(s) abiertas`,
					href: "/panel/cotizaciones?ver=facturas",
					tone: saldo > 0n ? "brand" : "ok",
				},
				{
					clave: "facturas_vencidas",
					label: "Facturas vencidas",
					valor: vencidas,
					hint: vencidas > 0 ? "Ya pasó su fecha de pago" : "Ninguna vencida",
					href: "/panel/cotizaciones?ver=facturas&vencidas=1",
					tone: vencidas > 0 ? "danger" : "ok",
				},
				{
					clave: "cotizaciones_enviadas",
					label: "Cotizaciones sin respuesta",
					valor: cotizacionesEnviadas,
					hint: cotizacionesEnviadas > 0 ? "El cliente aún no aprueba ni rechaza" : null,
					tone: cotizacionesEnviadas > 0 ? "warn" : "neutral",
				},
			],
		});
	}

	// --- Recordatorios --------------------------------------------------------------------------
	if (can(actor.role, "recordatorio:manage")) {
		const [vencidos, estaSemana] = await Promise.all([
			prisma.recordatorio.count({ where: { hecho: false, fecha: { lt: dia } } }),
			prisma.recordatorio.count({ where: { hecho: false, fecha: { gte: dia, lte: finSemana } } }),
		]);

		bloques.push({
			titulo: "Recordatorios",
			kpis: [
				{
					clave: "recordatorios_vencidos",
					label: "Recordatorios vencidos",
					valor: vencidos,
					hint: vencidos > 0 ? "Ya pasó la fecha de seguimiento" : "Al corriente",
					href: "/panel/recordatorios?vencidos=1",
					icon: "list",
					tone: vencidos > 0 ? "danger" : "ok",
				},
				{
					clave: "recordatorios_semana",
					label: "Pendientes esta semana",
					valor: estaSemana,
					href: "/panel/recordatorios",
					icon: "list",
					tone: estaSemana > 0 ? "brand" : "neutral",
				},
			],
		});
	}

	return bloques;
}
