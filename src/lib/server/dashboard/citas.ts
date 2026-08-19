/**
 * §17 — Citas: funnel de estados, conversión a nota, no-show, gráfica diaria.
 */
import prisma from "$lib/prisma";
import { enZona, fechaEnZona, sumarDias } from "$lib/agenda";
import type { Periodo } from "../dashboard-periodo";

export async function getDashboardCitas(periodo: Periodo) {
	const rango = { fecha: { gte: enZona(periodo.desde), lt: enZona(sumarDias(periodo.hasta, 1)) } };

	const [porEstado, conNota, todas] = await Promise.all([
		prisma.cita.groupBy({ by: ["estado"], where: rango, _count: true }),
		prisma.cita.count({ where: { ...rango, nota: { isNot: null } } }),
		prisma.cita.findMany({ where: rango, select: { fecha: true, estado: true } }),
	]);

	const cuenta = new Map(porEstado.map((f) => [f.estado, f._count]));
	const total = [...cuenta.values()].reduce((s, n) => s + n, 0);
	const noShow = cuenta.get("no_asistio") ?? 0;
	const confirmadas = ["confirmada", "en_proceso", "completada", "no_asistio"].reduce((s, e) => s + (cuenta.get(e) ?? 0), 0);

	const porDia = new Map<string, number>();
	for (const c of todas) {
		const dia = fechaEnZona(c.fecha);
		porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
	}
	const diaria = [...porDia.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => ({ key, label: key.slice(5, 10), value, valueLabel: String(value) }));

	return {
		porEstado: [
			{ key: "solicitada", label: "Solicitudes", value: cuenta.get("solicitada") ?? 0 },
			{ key: "confirmada", label: "Confirmadas", value: cuenta.get("confirmada") ?? 0 },
			{ key: "completada", label: "Atendidas", value: cuenta.get("completada") ?? 0 },
			{ key: "cancelada", label: "Canceladas", value: cuenta.get("cancelada") ?? 0 },
			{ key: "no_asistio", label: "No-show", value: noShow },
		],
		conversionCitaNota: total > 0 ? Math.round((conNota / total) * 1000) / 10 : null,
		noShowTasa: confirmadas > 0 ? Math.round((noShow / confirmadas) * 1000) / 10 : null,
		diaria,
	};
}
