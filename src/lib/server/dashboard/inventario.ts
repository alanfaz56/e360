/**
 * §13 — Inventario: valor en existencia, consumo del período, bajo mínimo, más usados.
 */
import prisma from "$lib/prisma";
import { aCentavos, rangoCreado } from "../comercial";
import { centavos, pesos } from "$lib/comercial";
import { enZona, fechaEnZona, sumarDias } from "$lib/agenda";
import type { Periodo } from "../dashboard-periodo";

/** Cross-column multiply (`restante * costoUnitario`) is a Postgres-side SUM, not JS-side. */
async function valorEnExistencia(): Promise<bigint> {
	const filas = await prisma.$queryRaw<{ valor: string | null }[]>`
		SELECT SUM(ROUND(restante * "costoUnitario", 2))::text AS valor
		FROM inventario_capa
		WHERE restante > 0
	`;
	return centavos(filas[0]?.valor ?? "0") ?? 0n;
}

export async function getDashboardInventario(periodo: Periodo) {
	const desdeInstante = enZona(periodo.desde);
	const hastaInstante = enZona(sumarDias(periodo.hasta, 1));

	const [valor, productosConExistencia, bajoMinimoCandidatos, solicitudesPendientes, consumo, movimientos, topProductos] =
		await Promise.all([
			valorEnExistencia(),
			prisma.producto.count({ where: { controlaInventario: true, existencia: { gt: 0 } } }),
			prisma.producto.findMany({
				where: { controlaInventario: true, minimo: { not: null }, archivedAt: null },
				select: { id: true, sku: true, nombre: true, existencia: true, minimo: true },
			}),
			prisma.solicitud_refaccion.count({ where: { estado: "pendiente" } }),
			prisma.inventario_movimiento.aggregate({
				_sum: { costoTotal: true },
				where: { tipo: "salida", ...rangoCreado(periodo.desde, periodo.hasta) },
			}),
			prisma.inventario_movimiento.findMany({
				where: { createdAt: { gte: desdeInstante, lt: hastaInstante }, tipo: { in: ["entrada", "salida"] } },
				select: { tipo: true, cantidad: true, createdAt: true },
			}),
			prisma.inventario_movimiento.groupBy({
				by: ["productoId"],
				where: { tipo: "salida", createdAt: { gte: desdeInstante, lt: hastaInstante } },
				_sum: { cantidad: true },
				orderBy: { _sum: { cantidad: "desc" } },
				take: 10,
			}),
		]);

	const bajoMinimo = bajoMinimoCandidatos
		.filter((p) => Number(p.existencia) <= Number(p.minimo))
		.map((p) => ({
			productoId: p.id,
			sku: p.sku,
			nombre: p.nombre,
			existencia: p.existencia.toFixed(3),
			minimo: p.minimo!.toFixed(3),
			diferencia: (Number(p.existencia) - Number(p.minimo)).toFixed(3),
		}));

	const porDia = new Map<string, { entradas: number; salidas: number }>();
	for (const m of movimientos) {
		const dia = fechaEnZona(m.createdAt);
		if (!porDia.has(dia)) porDia.set(dia, { entradas: 0, salidas: 0 });
		const b = porDia.get(dia)!;
		if (m.tipo === "entrada") b.entradas += Number(m.cantidad);
		else b.salidas += Number(m.cantidad);
	}
	const entradasVsSalidas = [...porDia.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, v]) => ({ key, label: key.slice(5, 10), ...v }));

	const productoIds = topProductos.map((t) => t.productoId);
	const nombres = await prisma.producto.findMany({ where: { id: { in: productoIds } }, select: { id: true, nombre: true } });
	const nombrePorId = new Map(nombres.map((p) => [p.id, p.nombre]));

	return {
		valorEnExistencia: pesos(valor),
		productosConExistencia,
		bajoMinimo,
		solicitudesPendientes,
		consumoPeriodo: pesos(aCentavos(consumo._sum.costoTotal)),
		entradasVsSalidas,
		topProductos: topProductos.map((t) => ({
			productoId: t.productoId,
			nombre: nombrePorId.get(t.productoId) ?? "—",
			cantidad: t._sum.cantidad?.toFixed(3) ?? "0",
		})),
	};
}
