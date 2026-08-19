/**
 * §19 — Requiere atención: solo alertas respaldadas por datos reales, umbrales centralizados.
 *
 * Reutiliza las cuentas ya calculadas por operacion.ts/inventario.ts/talleres.ts en vez de
 * volver a consultarlas — cada alerta que puede tomar prestado un número ya calculado lo hace.
 */
import prisma from "$lib/prisma";
import { enZona, hoy, sumarDias } from "$lib/agenda";
import { DIAS_COTIZACION_ANTIGUA, DIAS_GARANTIA_RECIENTE } from "$lib/dashboard-constantes";

export type Alerta = {
	severidad: "warn" | "danger";
	titulo: string;
	descripcion: string;
	href: string;
};

export async function getDashboardAlertas(precomputado: {
	notasAtrasadas: number;
	listasParaEntregar: number;
	productosBajoMinimo: number;
	solicitudesPendientes: number;
	tallerExterno: number;
}): Promise<Alerta[]> {
	const [cotizacionesAntiguas, facturasVencidas, garantiasRecientes, recordatoriosVencidos] = await Promise.all([
		prisma.cotizacion.count({
			where: { estado: { in: ["borrador", "enviada"] }, createdAt: { lt: enZona(sumarDias(hoy(), -DIAS_COTIZACION_ANTIGUA)) } },
		}),
		prisma.factura.count({ where: { estado: "emitida", vence: { lt: enZona(hoy()) } } }),
		prisma.nota_servicio.count({
			where: { garantiaDeId: { not: null }, recibidaAt: { gte: enZona(sumarDias(hoy(), -DIAS_GARANTIA_RECIENTE)) } },
		}),
		prisma.recordatorio.count({ where: { hecho: false, fecha: { lt: enZona(hoy()) } } }),
	]);

	const alertas: Alerta[] = [];
	const push = (n: number, alerta: Omit<Alerta, "descripcion"> & { descripcion: (n: number) => string }) => {
		if (n > 0) alertas.push({ severidad: alerta.severidad, titulo: alerta.titulo, descripcion: alerta.descripcion(n), href: alerta.href });
	};

	push(precomputado.notasAtrasadas, {
		severidad: "danger",
		titulo: "Trabajos atrasados",
		descripcion: (n) => `${n} trabajo${n === 1 ? "" : "s"} llevan demasiado tiempo abiertos`,
		href: "/panel/notas?abiertas=1",
	});
	push(cotizacionesAntiguas, {
		severidad: "warn",
		titulo: "Cotizaciones sin autorizar",
		descripcion: (n) => `${n} cotización${n === 1 ? "" : "es"} antigua${n === 1 ? "" : "s"} sin respuesta del cliente`,
		href: "/panel/cotizaciones?estado=enviada",
	});
	push(precomputado.listasParaEntregar, {
		severidad: "warn",
		titulo: "Listas para entregar",
		descripcion: (n) => `${n} vehículo${n === 1 ? "" : "s"} listo${n === 1 ? "" : "s"} esperando al cliente`,
		href: "/panel/notas?estado=lista",
	});
	push(facturasVencidas, {
		severidad: "danger",
		titulo: "Facturas vencidas",
		descripcion: (n) => `${n} factura${n === 1 ? "" : "s"} ya pasaron su fecha de pago`,
		href: "/panel/cotizaciones?ver=facturas&vencidas=1",
	});
	push(precomputado.productosBajoMinimo, {
		severidad: "warn",
		titulo: "Productos bajo mínimo",
		descripcion: (n) => `${n} producto${n === 1 ? "" : "s"} por debajo de su existencia mínima`,
		href: "/panel/inventario",
	});
	push(precomputado.solicitudesPendientes, {
		severidad: "warn",
		titulo: "Solicitudes de refacción pendientes",
		descripcion: (n) => `${n} solicitud${n === 1 ? "" : "es"} de refacción sin resolver`,
		href: "/panel/inventario",
	});
	push(precomputado.tallerExterno, {
		severidad: "warn",
		titulo: "Vehículos en talleres externos",
		descripcion: (n) => `${n} vehículo${n === 1 ? "" : "s"} actualmente fuera del taller`,
		href: "/panel/notas?estado=en_taller",
	});
	push(garantiasRecientes, {
		severidad: "warn",
		titulo: "Garantías recientes",
		descripcion: (n) => `${n} trabajo${n === 1 ? "" : "s"} de garantía en los últimos ${DIAS_GARANTIA_RECIENTE} días`,
		href: "/panel/notas",
	});
	push(recordatoriosVencidos, {
		severidad: "danger",
		titulo: "Recordatorios vencidos",
		descripcion: (n) => `${n} recordatorio${n === 1 ? "" : "s"} pasaron su fecha de seguimiento`,
		href: "/panel/recordatorios?vencidos=1",
	});

	return alertas;
}
