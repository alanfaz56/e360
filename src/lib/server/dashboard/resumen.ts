/**
 * §5 — Resumen: the four money questions and the three operational ones, all vs. periodo anterior.
 */
import prisma from "$lib/prisma";
import { aCentavos, rangoCreado, resumenDinero } from "../comercial";
import { margenPorcentaje, pesos } from "$lib/comercial";
import { NOTA_ESTADOS_ABIERTOS } from "$lib/notas";
import { enZona, sumarDias } from "$lib/agenda";
import { variacion, type Periodo } from "../dashboard-periodo";

/** Same day-range shape as `rangoCreado`, but over `resueltaAt` — when a cost was decided, not filed. */
const rangoResuelto = (desde: string, hasta: string) => ({
	resueltaAt: { gte: enZona(desde), lt: enZona(sumarDias(hasta, 1)) },
});

/** Costos del período: refacciones consumidas + costos internos aprobados. Postgres-side sums. */
export async function costoPeriodo(desde: string, hasta: string): Promise<bigint> {
	const [movimientos, internas] = await Promise.all([
		prisma.inventario_movimiento.aggregate({
			_sum: { costoTotal: true },
			where: { tipo: "salida", ...rangoCreado(desde, hasta) },
		}),
		prisma.cotizacion_interna.aggregate({
			_sum: { total: true },
			where: { estado: "aprobada", ...rangoResuelto(desde, hasta) },
		}),
	]);
	return aCentavos(movimientos._sum.costoTotal) + aCentavos(internas._sum.total);
}

async function bloqueDinero(desde: string, hasta: string) {
	const [dinero, costo, trabajosAbiertos, facturas] = await Promise.all([
		resumenDinero(desde, hasta),
		costoPeriodo(desde, hasta),
		prisma.nota_servicio.count({ where: { estado: { in: NOTA_ESTADOS_ABIERTOS } } }),
		prisma.factura.count({ where: { estado: { not: "cancelada" }, ...rangoCreado(desde, hasta) } }),
	]);
	const ventas = aCentavos(dinero.facturado);
	const utilidad = ventas - costo;
	const margen = margenPorcentaje(ventas, costo);
	const ticket = facturas > 0 ? ventas / BigInt(facturas) : null;
	return { ventas, utilidad, margen, trabajosAbiertos, ticket, dinero };
}

export async function getDashboardResumen(periodo: Periodo, anterior: { desde: string; hasta: string }) {
	const [actual, previo] = await Promise.all([
		bloqueDinero(periodo.desde, periodo.hasta),
		bloqueDinero(anterior.desde, anterior.hasta),
	]);

	return {
		ventas: { valor: pesos(actual.ventas), var: variacion(Number(actual.ventas), Number(previo.ventas)) },
		utilidad: { valor: pesos(actual.utilidad), var: variacion(Number(actual.utilidad), Number(previo.utilidad)) },
		margen: { valor: actual.margen, var: variacion(actual.margen ?? 0, previo.margen ?? 0) },
		trabajosAbiertos: {
			valor: actual.trabajosAbiertos,
			var: variacion(actual.trabajosAbiertos, previo.trabajosAbiertos),
		},
		ticketPromedio: {
			valor: actual.ticket !== null ? pesos(actual.ticket) : null,
			var:
				actual.ticket !== null && previo.ticket !== null
					? variacion(Number(actual.ticket), Number(previo.ticket))
					: { pct: null, mejora: null },
		},
		porCobrar: actual.dinero.porCobrar,
		vencido: actual.dinero.vencido,
	};
}
