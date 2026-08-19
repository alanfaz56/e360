/**
 * §11 — Desempeño operativo por mecánico (nunca "productividad": no hay horas reales registradas).
 *
 * Horas estimadas/reales/eficiencia/facturables: NOT IMPLEMENTED — ninguna columna existe, y el
 * PRD las excluye explícitamente. No se agregan campos de relleno para "dejar preparado" el hueco.
 */
import prisma from "$lib/prisma";
import { NOTA_ESTADOS_ABIERTOS } from "$lib/notas";
import { pesos } from "$lib/comercial";
import { rangoCreado } from "../comercial";
import { notasRentables } from "./rentabilidad";
import type { Periodo } from "../dashboard-periodo";

export async function getDashboardMecanicos(periodo: Periodo) {
	const rango = rangoCreado(periodo.desde, periodo.hasta);

	const [asignados, terminados, abiertos, mecanicos, notas] = await Promise.all([
		prisma.nota_servicio.groupBy({ by: ["mecanicoId"], where: { ...rango, mecanicoId: { not: null } }, _count: true }),
		prisma.nota_servicio.groupBy({
			by: ["mecanicoId"],
			where: { ...rango, mecanicoId: { not: null }, estado: "entregada" },
			_count: true,
		}),
		prisma.nota_servicio.groupBy({
			by: ["mecanicoId"],
			where: { mecanicoId: { not: null }, estado: { in: NOTA_ESTADOS_ABIERTOS } },
			_count: true,
		}),
		prisma.user.findMany({ where: { role: "taller" }, select: { id: true, name: true } }),
		notasRentables(periodo),
	]);

	const nombrePorId = new Map(mecanicos.map((m) => [m.id, m.name]));
	const terminadosPorId = new Map(terminados.map((t) => [t.mecanicoId!, t._count]));
	const abiertosPorId = new Map(abiertos.map((a) => [a.mecanicoId!, a._count]));

	const ventaPorMecanico = new Map<string, bigint>();
	const costoPorMecanico = new Map<string, bigint>();
	for (const n of notas) {
		if (!n.mecanicoId) continue;
		ventaPorMecanico.set(n.mecanicoId, (ventaPorMecanico.get(n.mecanicoId) ?? 0n) + n.venta);
		costoPorMecanico.set(n.mecanicoId, (costoPorMecanico.get(n.mecanicoId) ?? 0n) + n.costo);
	}

	return asignados
		.filter((a): a is typeof a & { mecanicoId: string } => a.mecanicoId !== null)
		.map((a) => {
			const venta = ventaPorMecanico.get(a.mecanicoId) ?? 0n;
			const costo = costoPorMecanico.get(a.mecanicoId) ?? 0n;
			return {
				mecanicoId: a.mecanicoId,
				nombre: nombrePorId.get(a.mecanicoId) ?? "—",
				asignados: a._count,
				terminados: terminadosPorId.get(a.mecanicoId) ?? 0,
				abiertos: abiertosPorId.get(a.mecanicoId) ?? 0,
				venta: pesos(venta),
				costo: pesos(costo),
				utilidad: pesos(venta - costo),
			};
		})
		.sort((a, b) => b.asignados - a.asignados);
}
