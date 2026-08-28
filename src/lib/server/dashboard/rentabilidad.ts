/**
 * §10 — Rentabilidad por nota_servicio: venta - refacciones - costos internos = utilidad.
 *
 * `notasRentables()` is the shared per-nota map every other module (mecánicos, talleres,
 * clientes, vehículos, garantías) joins against instead of re-running the same three aggregates —
 * Postgres does the summing, this only joins three small period-bounded maps in JS.
 */
import prisma from "$lib/prisma";
import { aCentavos } from "../comercial";
import { margenPorcentaje, pesos } from "$lib/comercial";
import { enZona, sumarDias } from "$lib/agenda";
import type { Periodo } from "../dashboard-periodo";

export type NotaRentable = {
	notaId: string;
	folio: number;
	clienteId: string | null;
	clienteNombre: string;
	unidadId: string | null;
	mecanicoId: string | null;
	tallerActualId: string | null;
	garantiaDeId: string | null;
	venta: bigint;
	costo: bigint;
	utilidad: bigint;
	margen: number | null;
};

/**
 * Notas con al menos una factura O nota de venta en el período (por `entregadaAt` cuando existe,
 * si no `recibidaAt`). Una nota de venta ya `facturada` no cuenta aparte en el `OR` — la factura
 * que resultó de ella ya la cubre — pero SÍ sigue contando como venta abajo a través de esa misma
 * factura, nunca de las dos a la vez.
 */
export async function notasRentables(periodo: Periodo): Promise<NotaRentable[]> {
	const rango = { gte: enZona(periodo.desde), lt: enZona(sumarDias(periodo.hasta, 1)) };
	const notas = await prisma.nota_servicio.findMany({
		where: {
			AND: [
				{ OR: [{ entregadaAt: rango }, { entregadaAt: null, recibidaAt: rango }] },
				{
					OR: [
						{ facturas: { some: { estado: { not: "cancelada" } } } },
						{ notasVenta: { some: { estado: "activa" } } },
					],
				},
			],
		},
		select: {
			id: true,
			folio: true,
			clienteId: true,
			cliente: { select: { nombreCompleto: true } },
			unidadId: true,
			mecanicoId: true,
			tallerActualId: true,
			garantiaDeId: true,
		},
	});
	if (notas.length === 0) return [];

	const ids = notas.map((n) => n.id);
	const [ventas, ventasNotaVenta, refacciones, internas] = await Promise.all([
		prisma.factura.groupBy({ by: ["notaId"], where: { notaId: { in: ids }, estado: { not: "cancelada" } }, _sum: { total: true } }),
		// `activa` only — a `facturada` nota_venta's total already counts through `ventas` above.
		prisma.nota_venta.groupBy({ by: ["notaId"], where: { notaId: { in: ids }, estado: "activa" }, _sum: { total: true } }),
		prisma.inventario_movimiento.groupBy({ by: ["notaId"], where: { notaId: { in: ids }, tipo: "salida" }, _sum: { costoTotal: true } }),
		prisma.cotizacion_interna.groupBy({ by: ["notaId"], where: { notaId: { in: ids }, estado: "aprobada" }, _sum: { total: true } }),
	]);

	const ventaPorNota = new Map(ventas.map((v) => [v.notaId, aCentavos(v._sum.total)]));
	for (const v of ventasNotaVenta) {
		if (!v.notaId) continue;
		ventaPorNota.set(v.notaId, (ventaPorNota.get(v.notaId) ?? 0n) + aCentavos(v._sum.total));
	}
	const costoPorNota = new Map<string, bigint>();
	for (const r of refacciones) costoPorNota.set(r.notaId!, (costoPorNota.get(r.notaId!) ?? 0n) + aCentavos(r._sum.costoTotal));
	for (const i of internas) costoPorNota.set(i.notaId, (costoPorNota.get(i.notaId) ?? 0n) + aCentavos(i._sum.total));

	return notas.map((n) => {
		const venta = ventaPorNota.get(n.id) ?? 0n;
		const costo = costoPorNota.get(n.id) ?? 0n;
		const utilidad = venta - costo;
		return {
			notaId: n.id,
			folio: n.folio,
			clienteId: n.clienteId,
			clienteNombre: n.cliente.nombreCompleto,
			unidadId: n.unidadId,
			mecanicoId: n.mecanicoId,
			tallerActualId: n.tallerActualId,
			garantiaDeId: n.garantiaDeId,
			venta,
			costo,
			utilidad,
			margen: margenPorcentaje(venta, costo),
		};
	});
}

export async function getDashboardRentabilidad(periodo: Periodo) {
	const notas = await notasRentables(periodo);
	const rentables = notas.filter((n) => n.venta > 0n);

	const menorMargen = [...rentables]
		.sort((a, b) => (a.margen ?? 0) - (b.margen ?? 0))
		.slice(0, 10);
	const mayorUtilidad = [...rentables].sort((a, b) => Number(b.utilidad - a.utilidad)).slice(0, 10);

	const fila = (n: NotaRentable) => ({
		notaId: n.notaId,
		folio: n.folio,
		cliente: n.clienteNombre,
		venta: pesos(n.venta),
		costo: pesos(n.costo),
		utilidad: pesos(n.utilidad),
		margen: n.margen,
	});

	return { menorMargen: menorMargen.map(fila), mayorUtilidad: mayorUtilidad.map(fila) };
}
