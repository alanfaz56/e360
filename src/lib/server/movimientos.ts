import prisma from "$lib/prisma";
import { citaEstadoLabel } from "$lib/citas";
import { notaEstadoLabel } from "$lib/notas";
import { pesos } from "$lib/comercial";

/**
 * Home's "últimos movimientos" — a live read of citas/notas/pagos, NOT the audit trail.
 * `audit_log` stays Admin-only on purpose (Rule 3); this is a different thing: a shop-wide
 * activity feed built from the same rows `cita:read` / `nota:read` / `pago:read` already expose,
 * so it carries its own permission (`movimientos:read`) rather than widening audit:read.
 */
export type Movimiento = {
	id: string;
	texto: string;
	detalle: string;
	href: string;
	fecha: string;
};

export async function ultimosMovimientos(limite = 15): Promise<Movimiento[]> {
	const porFuente = limite;

	const [citas, notas, pagos] = await Promise.all([
		prisma.cita.findMany({
			orderBy: { updatedAt: "desc" },
			take: porFuente,
			select: { id: true, folio: true, estado: true, nombre: true, updatedAt: true },
		}),
		prisma.nota_servicio.findMany({
			orderBy: { updatedAt: "desc" },
			take: porFuente,
			select: {
				id: true,
				folio: true,
				estado: true,
				updatedAt: true,
				cliente: { select: { nombreCompleto: true } },
			},
		}),
		prisma.pago.findMany({
			orderBy: { createdAt: "desc" },
			take: porFuente,
			select: {
				id: true,
				monto: true,
				metodo: true,
				createdAt: true,
				factura: {
					select: { id: true, folio: true, notaId: true, cliente: { select: { nombreCompleto: true } } },
				},
				notaVenta: {
					select: { id: true, folio: true, notaId: true, cliente: { select: { nombreCompleto: true } } },
				},
			},
		}),
	]);

	const movimientos: Movimiento[] = [
		...citas.map((c) => ({
			id: `cita-${c.id}`,
			texto: `Cita #${c.folio} · ${c.nombre}`,
			detalle: citaEstadoLabel(c.estado),
			href: `/panel/citas/${c.id}`,
			fecha: c.updatedAt.toISOString(),
		})),
		...notas.map((n) => ({
			id: `nota-${n.id}`,
			texto: `Nota #${n.folio} · ${n.cliente?.nombreCompleto ?? "Sin cliente"}`,
			detalle: notaEstadoLabel(n.estado),
			href: `/panel/notas/${n.id}`,
			fecha: n.updatedAt.toISOString(),
		})),
		// A pago belongs to exactly one of factura / notaVenta (`pago_exactamente_un_destino_check`
		// enforces it in the database) — never both, never neither.
		// A nota_venta has no detail page of its own — it only ever renders inline on its
		// nota_servicio's page — so one with no notaId has nowhere to link to and is skipped here,
		// the same way a payment with neither destination would be (the CHECK constraint just
		// makes that case impossible).
		...pagos.flatMap((p) => {
			const destino = p.factura ?? p.notaVenta!;
			const href = p.factura
				? `/panel/facturas/${p.factura.id}`
				: destino.notaId
					? `/panel/notas/${destino.notaId}`
					: null;
			if (href === null) return [];
			return [
				{
					id: `pago-${p.id}`,
					texto: `Pago de $${pesos(BigInt(Math.round(Number(p.monto) * 100)))} · ${destino.cliente.nombreCompleto}`,
					detalle: p.factura ? `Factura #${p.factura.folio}` : `Nota de venta #${p.notaVenta!.folio}`,
					href,
					fecha: p.createdAt.toISOString(),
				},
			];
		}),
	];

	return movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, limite);
}
