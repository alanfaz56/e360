/**
 * §6 — Ventas/costos/utilidad, agrupado por día (periodos cortos) o semana (periodos largos).
 */
import prisma from "$lib/prisma";
import { aCentavos } from "../comercial";
import { pesos, margenPorcentaje } from "$lib/comercial";
import { diasEntre, enZona, fechaEnZona, sumarDias } from "$lib/agenda";
import { lunesDe, type Periodo } from "../dashboard-periodo";

export type PuntoVentas = {
	key: string;
	label: string;
	ventas: number;
	costos: number;
	utilidad: number;
	margen: number | null;
	ventasLabel: string;
	costosLabel: string;
	utilidadLabel: string;
};

export async function getDashboardVentas(periodo: Periodo): Promise<PuntoVentas[]> {
	const dias = diasEntre(periodo.desde, periodo.hasta) + 1;
	const porSemana = dias > 60; // más de ~2 meses: agrupar por semana o el eje se vuelve ilegible
	const desdeInstante = enZona(periodo.desde);
	const hastaInstante = enZona(sumarDias(periodo.hasta, 1));

	const [facturas, movimientos, internas] = await Promise.all([
		prisma.factura.findMany({
			where: { estado: { not: "cancelada" }, createdAt: { gte: desdeInstante, lt: hastaInstante } },
			select: { total: true, createdAt: true },
		}),
		prisma.inventario_movimiento.findMany({
			where: { tipo: "salida", createdAt: { gte: desdeInstante, lt: hastaInstante } },
			select: { costoTotal: true, createdAt: true },
		}),
		prisma.cotizacion_interna.findMany({
			where: { estado: "aprobada", resueltaAt: { gte: desdeInstante, lt: hastaInstante } },
			select: { total: true, resueltaAt: true },
		}),
	]);

	const bucketKey = (fecha: string) => (porSemana ? lunesDe(fecha) : fecha);

	const ventasPorBucket = new Map<string, bigint>();
	for (const f of facturas) {
		const k = bucketKey(fechaEnZona(f.createdAt));
		ventasPorBucket.set(k, (ventasPorBucket.get(k) ?? 0n) + aCentavos(f.total));
	}
	const costosPorBucket = new Map<string, bigint>();
	for (const m of movimientos) {
		const k = bucketKey(fechaEnZona(m.createdAt));
		costosPorBucket.set(k, (costosPorBucket.get(k) ?? 0n) + aCentavos(m.costoTotal));
	}
	for (const i of internas) {
		if (!i.resueltaAt) continue;
		const k = bucketKey(fechaEnZona(i.resueltaAt));
		costosPorBucket.set(k, (costosPorBucket.get(k) ?? 0n) + aCentavos(i.total));
	}

	const claves: string[] = [];
	const vistos = new Set<string>();
	const paso = porSemana ? 7 : 1;
	for (let i = 0; i < dias; i += paso) {
		const k = bucketKey(sumarDias(periodo.desde, i));
		if (!vistos.has(k)) {
			vistos.add(k);
			claves.push(k);
		}
	}

	return claves.map((k) => {
		const ventas = ventasPorBucket.get(k) ?? 0n;
		const costos = costosPorBucket.get(k) ?? 0n;
		const utilidad = ventas - costos;
		return {
			key: k,
			label: porSemana ? `Sem. ${k.slice(5, 10)}` : k.slice(5, 10),
			ventas: Number(ventas),
			costos: Number(costos),
			utilidad: Number(utilidad),
			margen: margenPorcentaje(ventas, costos),
			ventasLabel: `$${pesos(ventas)}`,
			costosLabel: `$${pesos(costos)}`,
			utilidadLabel: `$${pesos(utilidad)}`,
		};
	});
}
