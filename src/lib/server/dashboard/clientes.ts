/**
 * §15 — Clientes: activos, nuevos, recurrentes, top por venta y por utilidad (independientes:
 * mayor facturación no implica mayor rentabilidad, el PRD lo advierte explícitamente).
 */
import prisma from "$lib/prisma";
import { aCentavos, rangoCreado } from "../comercial";
import { pesos } from "$lib/comercial";
import { notasRentables } from "./rentabilidad";
import type { Periodo } from "../dashboard-periodo";

export async function getDashboardClientes(periodo: Periodo) {
	const [activos, nuevos, recurrentesRaw, topVenta, notas] = await Promise.all([
		prisma.cliente.count({ where: { archivedAt: null } }),
		prisma.cliente.count({ where: { ...rangoCreado(periodo.desde, periodo.hasta), archivedAt: null } }),
		// Recurrente = más de un servicio en la historia del cliente, no solo en el período.
		prisma.nota_servicio.groupBy({ by: ["clienteId"], _count: true }),
		prisma.factura.groupBy({
			by: ["clienteId"],
			where: { estado: { not: "cancelada" }, ...rangoCreado(periodo.desde, periodo.hasta) },
			_sum: { total: true },
			orderBy: { _sum: { total: "desc" } },
			take: 10,
		}),
		notasRentables(periodo),
	]);

	const recurrentes = recurrentesRaw.filter((c) => c._count > 1).length;

	const utilidadPorCliente = new Map<string, { nombre: string; venta: bigint; utilidad: bigint }>();
	for (const n of notas) {
		if (!n.clienteId) continue;
		if (!utilidadPorCliente.has(n.clienteId)) {
			utilidadPorCliente.set(n.clienteId, { nombre: n.clienteNombre, venta: 0n, utilidad: 0n });
		}
		const b = utilidadPorCliente.get(n.clienteId)!;
		b.venta += n.venta;
		b.utilidad += n.utilidad;
	}
	const topUtilidad = [...utilidadPorCliente.entries()]
		.sort(([, a], [, b]) => Number(b.utilidad - a.utilidad))
		.slice(0, 10)
		.map(([clienteId, b]) => ({ clienteId, cliente: b.nombre, venta: pesos(b.venta), utilidad: pesos(b.utilidad) }));

	const clienteIds = topVenta.map((c) => c.clienteId);
	const [clientesInfo, ventas] = await Promise.all([
		prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, nombreCompleto: true } }),
		prisma.factura.aggregate({
			_sum: { total: true },
			_count: true,
			where: { estado: { not: "cancelada" }, ...rangoCreado(periodo.desde, periodo.hasta) },
		}),
	]);
	const nombrePorId = new Map(clientesInfo.map((c) => [c.id, c.nombreCompleto]));

	return {
		activos,
		nuevos,
		recurrentes,
		ticketPromedio: ventas._count > 0 ? pesos(aCentavos(ventas._sum.total) / BigInt(ventas._count)) : null,
		topVenta: topVenta.map((c) => ({
			clienteId: c.clienteId,
			cliente: nombrePorId.get(c.clienteId) ?? "—",
			venta: pesos(aCentavos(c._sum.total)),
		})),
		topUtilidad,
	};
}
