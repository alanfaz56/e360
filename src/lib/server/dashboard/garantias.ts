/**
 * §18 — Garantías: trabajos de garantía, % que regresan, costo asociado, tiempo original→garantía.
 */
import prisma from "$lib/prisma";
import { pesos } from "$lib/comercial";
import { diasEntre, enZona, fechaEnZona, sumarDias } from "$lib/agenda";
import { notasRentables } from "./rentabilidad";
import type { Periodo } from "../dashboard-periodo";

export async function getDashboardGarantias(periodo: Periodo) {
	const rango = { recibidaAt: { gte: enZona(periodo.desde), lt: enZona(sumarDias(periodo.hasta, 1)) } };

	const [trabajosGarantia, entregadas, pares, notas] = await Promise.all([
		prisma.nota_servicio.count({ where: { ...rango, garantiaDeId: { not: null } } }),
		prisma.nota_servicio.count({ where: { ...rango, estado: "entregada" } }),
		prisma.nota_servicio.findMany({
			where: { ...rango, garantiaDeId: { not: null } },
			select: { id: true, recibidaAt: true, garantiaDe: { select: { entregadaAt: true } } },
		}),
		notasRentables(periodo),
	]);

	const tiempos = pares
		.filter((n) => n.garantiaDe?.entregadaAt)
		.map((n) => diasEntre(fechaEnZona(n.garantiaDe!.entregadaAt!), fechaEnZona(n.recibidaAt)));
	const tiempoPromedio = tiempos.length > 0 ? Math.round((tiempos.reduce((s, d) => s + d, 0) / tiempos.length) * 10) / 10 : null;

	const idsGarantia = new Set(pares.map((n) => n.id));
	const costoGarantia = notas.filter((n) => idsGarantia.has(n.notaId)).reduce((s, n) => s + n.costo, 0n);

	const mensual = new Map<string, number>();
	for (const n of pares) {
		const mes = fechaEnZona(n.recibidaAt).slice(0, 7);
		mensual.set(mes, (mensual.get(mes) ?? 0) + 1);
	}
	const chart = [...mensual.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => ({ key, label: key.slice(5, 7), value, valueLabel: String(value) }));

	return {
		trabajosGarantia,
		porcentajeQueRegresan: entregadas > 0 ? Math.round((trabajosGarantia / entregadas) * 1000) / 10 : null,
		costoAsociado: pesos(costoGarantia),
		tiempoPromedioDias: tiempoPromedio,
		chart,
	};
}
