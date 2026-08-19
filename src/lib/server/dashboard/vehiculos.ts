/**
 * §16 — Vehículos: unidades atendidas, servicios por unidad, marcas, mayor gasto acumulado.
 */
import prisma from "$lib/prisma";
import { pesos } from "$lib/comercial";
import { rangoCreado } from "../comercial";
import { notasRentables } from "./rentabilidad";
import type { Periodo } from "../dashboard-periodo";

export async function getDashboardVehiculos(periodo: Periodo) {
	const rango = rangoCreado(periodo.desde, periodo.hasta);

	const [distintas, servicios, marcas, notas] = await Promise.all([
		prisma.nota_servicio.findMany({ where: rango, distinct: ["unidadId"], select: { unidadId: true } }),
		prisma.nota_servicio.count({ where: rango }),
		prisma.nota_servicio.findMany({ where: rango, select: { unidad: { select: { marca: true } } } }),
		notasRentables(periodo),
	]);

	const unidadesAtendidas = distintas.length;
	const promedio = unidadesAtendidas > 0 ? Math.round((servicios / unidadesAtendidas) * 10) / 10 : null;

	const porMarca = new Map<string, number>();
	for (const s of marcas) {
		const marca = s.unidad.marca;
		porMarca.set(marca, (porMarca.get(marca) ?? 0) + 1);
	}
	const marcasChart = [...porMarca.entries()]
		.sort(([, a], [, b]) => b - a)
		.slice(0, 10)
		.map(([marca, count]) => ({ key: marca, label: marca, value: count, valueLabel: String(count) }));

	const gastoPorUnidad = new Map<string, { unidadId: string; venta: bigint }>();
	for (const n of notas) {
		if (!n.unidadId) continue;
		if (!gastoPorUnidad.has(n.unidadId)) gastoPorUnidad.set(n.unidadId, { unidadId: n.unidadId, venta: 0n });
		gastoPorUnidad.get(n.unidadId)!.venta += n.venta;
	}
	const topIds = [...gastoPorUnidad.values()].sort((a, b) => Number(b.venta - a.venta)).slice(0, 10);
	const unidadesInfo = await prisma.unidad.findMany({
		where: { id: { in: topIds.map((t) => t.unidadId) } },
		select: { id: true, marca: true, modelo: true, placas: true },
	});
	const infoPorId = new Map(unidadesInfo.map((u) => [u.id, u]));

	return {
		unidadesAtendidas,
		servicios,
		promedioServiciosPorUnidad: promedio,
		marcas: marcasChart,
		mayorGasto: topIds.map((t) => {
			const u = infoPorId.get(t.unidadId);
			return {
				unidadId: t.unidadId,
				vehiculo: u ? `${u.marca} ${u.modelo}${u.placas ? ` (${u.placas})` : ""}` : "—",
				gasto: pesos(t.venta),
			};
		}),
	};
}
