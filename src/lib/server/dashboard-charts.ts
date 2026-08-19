/**
 * The home dashboard's charts — same gating philosophy as kpis.ts: each is gated on the
 * permission of the data it aggregates, never a separate "reports" key.
 *
 * Colors here are a single hue's ramp (severity, light→dark) or a single series color — never a
 * hand-picked categorical palette. This app's status colors (ok/warn/danger/brand) collide when
 * placed side by side (brand and danger render the *same* red), so ordered severity is encoded as
 * lightness on one hue instead, with every value direct-labeled — color is never the only way to
 * read a bar. See the dataviz skill's color-formula and marks-and-anatomy references.
 */
import prisma from "$lib/prisma";
import { diasEntre, fechaEnZona, hoy, sumarDias } from "$lib/agenda";
import { pesos } from "$lib/comercial";
import { NOTA_ESTADOS_ABIERTOS, notaEstadoLabel } from "$lib/notas";
import { aCentavos } from "./comercial";

/**
 * Receivables bucketed by how overdue they are — the shop's own aging-of-cartera view. Only
 * `emitida` invoices carry a balance; `vence` (and so a due date) only exists on credit sales, so
 * a cash sale still open (rare — awaiting payment at the counter) falls into "al corriente".
 */
export async function carteraPorAntiguedad() {
	const facturas = await prisma.factura.findMany({
		where: { estado: "emitida" },
		select: { vence: true, total: true, pagos: { select: { monto: true } } },
	});

	const hoyStr = hoy();
	const buckets = [
		{ clave: "al_corriente", label: "Al corriente", colorClass: "bg-accent-300", monto: 0n, count: 0 },
		{ clave: "d1_30", label: "1–30 días", colorClass: "bg-accent-400", monto: 0n, count: 0 },
		{ clave: "d31_60", label: "31–60 días", colorClass: "bg-accent-500", monto: 0n, count: 0 },
		{ clave: "d60_mas", label: "60+ días", colorClass: "bg-accent-600", monto: 0n, count: 0 },
	];

	for (const f of facturas) {
		const pagado = f.pagos.reduce((s, p) => s + aCentavos(p.monto), 0n);
		const saldo = aCentavos(f.total) - pagado;
		if (saldo <= 0n) continue;

		const dias = f.vence ? diasEntre(hoyStr, fechaEnZona(f.vence)) : null;
		const bucket = dias === null || dias >= 0 ? 0 : dias >= -30 ? 1 : dias >= -60 ? 2 : 3;
		buckets[bucket]!.monto += saldo;
		buckets[bucket]!.count += 1;
	}

	return buckets.map((b) => ({
		key: b.clave,
		label: b.label,
		colorClass: b.colorClass,
		hint: b.count > 0 ? `${b.count} factura${b.count === 1 ? "" : "s"}` : null,
		value: Number(b.monto),
		valueLabel: `$${pesos(b.monto)}`,
	}));
}

/** Money actually collected, per day, for the last `dias` days — a 14-day default reads as two
 *  weeks without crowding a dashboard card. */
export async function ingresosDiarios(dias = 14) {
	const desde = sumarDias(hoy(), -(dias - 1));
	const pagos = await prisma.pago.findMany({
		where: { pagadoAt: { gte: new Date(`${desde}T00:00:00-07:00`) } },
		select: { monto: true, pagadoAt: true },
	});

	const porDia = new Map<string, bigint>();
	for (const p of pagos) {
		const clave = fechaEnZona(p.pagadoAt);
		porDia.set(clave, (porDia.get(clave) ?? 0n) + aCentavos(p.monto));
	}

	return Array.from({ length: dias }, (_, i) => {
		const fecha = sumarDias(desde, i);
		const monto = porDia.get(fecha) ?? 0n;
		return {
			key: fecha,
			// day-of-month only — a 14-point x-axis has no room for "ago 04"
			label: fecha.slice(8, 10),
			value: Number(monto),
			valueLabel: `$${pesos(monto)}`,
		};
	});
}

/** How many open notas sit in each stage of the shop floor right now. */
export async function notasPorEstado() {
	const filas = await prisma.nota_servicio.groupBy({
		by: ["estado"],
		where: { estado: { in: NOTA_ESTADOS_ABIERTOS } },
		_count: true,
	});
	const cuenta = new Map(filas.map((f) => [f.estado, f._count]));

	return NOTA_ESTADOS_ABIERTOS.map((estado) => {
		const n = cuenta.get(estado) ?? 0;
		return {
			key: estado,
			label: notaEstadoLabel(estado),
			href: `/panel/notas?estado=${estado}`,
			value: n,
			valueLabel: String(n),
		};
	});
}
