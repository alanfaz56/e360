/**
 * §9 — Funnel de cotizaciones sobre estados reales (nunca uno inventado) y tabla de pendientes.
 */
import prisma from "$lib/prisma";
import { aCentavos, rangoCreado } from "../comercial";
import { pesos } from "$lib/comercial";
import { diasEntre, fechaEnZona, hoy } from "$lib/agenda";
import type { Periodo } from "../dashboard-periodo";

export async function getDashboardCotizaciones(periodo: Periodo) {
	const rango = rangoCreado(periodo.desde, periodo.hasta);

	const [porEstado, porInterno, pendientes] = await Promise.all([
		prisma.cotizacion.groupBy({ by: ["estado"], where: rango, _count: true, _sum: { total: true } }),
		prisma.cotizacion.groupBy({ by: ["estadoInterno"], where: rango, _count: true }),
		prisma.cotizacion.findMany({
			where: { estado: { in: ["borrador", "enviada"] } },
			orderBy: { createdAt: "asc" },
			take: 25,
			select: {
				id: true,
				folio: true,
				total: true,
				estado: true,
				createdAt: true,
				notaId: true,
				nota: { select: { folio: true, cliente: { select: { nombreCompleto: true } }, unidad: { select: { marca: true, modelo: true, placas: true } } } },
			},
		}),
	]);

	const cuenta = new Map(porEstado.map((f) => [f.estado, f._count]));
	const monto = new Map(porEstado.map((f) => [f.estado, aCentavos(f._sum.total)]));
	const cuentaInterno = new Map(porInterno.map((f) => [f.estadoInterno, f._count]));

	const creadas = porEstado.reduce((s, f) => s + f._count, 0);
	const enviadas = ["enviada", "autorizada", "rechazada", "vencida"].reduce((s, e) => s + (cuenta.get(e) ?? 0), 0);
	const autorizadas = cuenta.get("autorizada") ?? 0;
	const rechazadas = cuenta.get("rechazada") ?? 0;
	const proceso = cuentaInterno.get("en_proceso") ?? 0;
	const completadas = ["completada", "por_cobrar", "cobrada"].reduce((s, e) => s + (cuentaInterno.get(e) ?? 0), 0);
	const cobradas = cuentaInterno.get("cobrada") ?? 0;

	const cotizadoTotal = (monto.get("borrador") ?? 0n) + (monto.get("enviada") ?? 0n) + (monto.get("autorizada") ?? 0n) + (monto.get("rechazada") ?? 0n) + (monto.get("vencida") ?? 0n);
	const autorizadoTotal = monto.get("autorizada") ?? 0n;
	const rechazadoTotal = monto.get("rechazada") ?? 0n;
	const pendienteTotal = (monto.get("borrador") ?? 0n) + (monto.get("enviada") ?? 0n);

	return {
		funnel: [
			{ key: "creadas", label: "Creadas", value: creadas },
			{ key: "enviadas", label: "Enviadas", value: enviadas },
			{ key: "autorizadas", label: "Autorizadas", value: autorizadas },
			{ key: "proceso", label: "En proceso", value: proceso },
			{ key: "completadas", label: "Completadas", value: completadas },
			{ key: "cobradas", label: "Cobradas", value: cobradas },
		],
		kpis: {
			cotizado: pesos(cotizadoTotal),
			autorizado: pesos(autorizadoTotal),
			rechazado: pesos(rechazadoTotal),
			pendiente: pesos(pendienteTotal),
			porcentajeAutorizacion: autorizadas + rechazadas > 0 ? Math.round((autorizadas / (autorizadas + rechazadas)) * 1000) / 10 : null,
		},
		pendientes: pendientes.map((c) => ({
			id: c.id,
			folio: c.folio,
			cliente: c.nota.cliente?.nombreCompleto ?? "—",
			unidad: c.nota.unidad ? `${c.nota.unidad.marca} ${c.nota.unidad.modelo}${c.nota.unidad.placas ? ` (${c.nota.unidad.placas})` : ""}` : "—",
			notaId: c.notaId,
			notaFolio: c.nota.folio,
			total: pesos(aCentavos(c.total)),
			estado: c.estado,
			createdAt: c.createdAt.toISOString(),
			diasPendiente: diasEntre(fechaEnZona(c.createdAt), hoy()),
		})),
	};
}
