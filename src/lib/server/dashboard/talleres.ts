/**
 * §12 — Talleres externos: partner shops only (`esInterno: false` — our own bay is not "external").
 */
import prisma from "$lib/prisma";
import { pesos } from "$lib/comercial";
import { diasEntre, enZona, fechaEnZona, sumarDias } from "$lib/agenda";
import { notasRentables } from "./rentabilidad";
import type { Periodo } from "../dashboard-periodo";

export async function getDashboardTalleres(periodo: Periodo) {
	const rangoInstante = { gte: enZona(periodo.desde), lt: enZona(sumarDias(periodo.hasta, 1)) };

	const [talleres, enviadas, fueraActualmente, transferenciasCerradas, qa, notas] = await Promise.all([
		prisma.taller.findMany({ where: { esInterno: false, archivedAt: null }, select: { id: true, nombre: true } }),
		prisma.nota_transferencia.groupBy({ by: ["tallerId"], where: { desde: rangoInstante }, _count: true }),
		prisma.nota_transferencia.groupBy({ by: ["tallerId"], where: { hasta: null }, _count: true }),
		prisma.nota_transferencia.findMany({
			where: { hasta: { not: null }, desde: rangoInstante },
			select: { tallerId: true, desde: true, hasta: true, notaId: true },
		}),
		prisma.nota_transferencia.groupBy({
			by: ["tallerId", "qaResultado"],
			where: { qaResultado: { not: null }, desde: rangoInstante },
			_count: true,
		}),
		notasRentables(periodo),
	]);

	const notaIdsPorTaller = new Map<string, Set<string>>();
	for (const t of transferenciasCerradas) {
		if (!notaIdsPorTaller.has(t.tallerId)) notaIdsPorTaller.set(t.tallerId, new Set());
		notaIdsPorTaller.get(t.tallerId)!.add(t.notaId);
	}
	const costoPorNota = new Map(notas.map((n) => [n.notaId, n.costo]));

	const enviadasPorId = new Map(enviadas.map((e) => [e.tallerId, e._count]));
	const fueraPorId = new Map(fueraActualmente.map((f) => [f.tallerId, f._count]));

	const tiempoFueraPorTaller = new Map<string, number[]>();
	for (const t of transferenciasCerradas) {
		const dias = diasEntre(fechaEnZona(t.desde), fechaEnZona(t.hasta!));
		if (!tiempoFueraPorTaller.has(t.tallerId)) tiempoFueraPorTaller.set(t.tallerId, []);
		tiempoFueraPorTaller.get(t.tallerId)!.push(dias);
	}

	const qaPorTaller = new Map<string, { aprobado: number; con_detalles: number; rechazado: number }>();
	for (const q of qa) {
		if (!qaPorTaller.has(q.tallerId)) qaPorTaller.set(q.tallerId, { aprobado: 0, con_detalles: 0, rechazado: 0 });
		const bucket = qaPorTaller.get(q.tallerId)!;
		if (q.qaResultado === "aprobado" || q.qaResultado === "con_detalles" || q.qaResultado === "rechazado") {
			bucket[q.qaResultado] = q._count;
		}
	}

	const filas = talleres.map((t) => {
		const costoExterno = [...(notaIdsPorTaller.get(t.id) ?? [])].reduce((s, notaId) => s + (costoPorNota.get(notaId) ?? 0n), 0n);
		const tiempos = tiempoFueraPorTaller.get(t.id) ?? [];
		const qaTaller = qaPorTaller.get(t.id) ?? { aprobado: 0, con_detalles: 0, rechazado: 0 };
		const qaTotal = qaTaller.aprobado + qaTaller.con_detalles + qaTaller.rechazado;
		return {
			tallerId: t.id,
			nombre: t.nombre,
			enviados: enviadasPorId.get(t.id) ?? 0,
			fueraActualmente: fueraPorId.get(t.id) ?? 0,
			costoExterno: pesos(costoExterno),
			tiempoFueraPromedio: tiempos.length > 0 ? Math.round((tiempos.reduce((s, d) => s + d, 0) / tiempos.length) * 10) / 10 : null,
			qa: qaTaller,
			qaAprobadoTasa: qaTotal > 0 ? Math.round((qaTaller.aprobado / qaTotal) * 1000) / 10 : null,
		};
	});

	return filas.sort((a, b) => (b.qaAprobadoTasa ?? -1) - (a.qaAprobadoTasa ?? -1));
}
