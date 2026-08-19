/**
 * §14 — Cobranza: aging a 5 cubetas (más fino que el 4-cubetas de dashboard-charts.ts para el home)
 * y top 10 deudores. Cubetas separadas a propósito — cada pantalla pidió un corte distinto.
 */
import prisma from "$lib/prisma";
import { aCentavos } from "../comercial";
import { pesos } from "$lib/comercial";
import { diasEntre, fechaEnZona, hoy } from "$lib/agenda";

export async function carteraPorAntiguedadDetallada() {
	const facturas = await prisma.factura.findMany({
		where: { estado: "emitida" },
		select: { vence: true, total: true, pagos: { select: { monto: true } } },
	});

	const hoyStr = hoy();
	const buckets = [
		{ clave: "por_vencer", label: "Por vencer", monto: 0n, count: 0 },
		{ clave: "d1_30", label: "1–30 días", monto: 0n, count: 0 },
		{ clave: "d31_60", label: "31–60 días", monto: 0n, count: 0 },
		{ clave: "d61_90", label: "61–90 días", monto: 0n, count: 0 },
		{ clave: "d90_mas", label: "90+ días", monto: 0n, count: 0 },
	];

	for (const f of facturas) {
		const pagado = f.pagos.reduce((s, p) => s + aCentavos(p.monto), 0n);
		const saldo = aCentavos(f.total) - pagado;
		if (saldo <= 0n) continue;

		const dias = f.vence ? diasEntre(hoyStr, fechaEnZona(f.vence)) : null;
		const bucket = dias === null || dias >= 0 ? 0 : dias >= -30 ? 1 : dias >= -60 ? 2 : dias >= -90 ? 3 : 4;
		buckets[bucket]!.monto += saldo;
		buckets[bucket]!.count += 1;
	}

	return buckets.map((b) => ({
		key: b.clave,
		label: b.label,
		value: Number(b.monto),
		valueLabel: `$${pesos(b.monto)}`,
		hint: b.count > 0 ? `${b.count} factura${b.count === 1 ? "" : "s"}` : null,
	}));
}

export async function topDeudores() {
	const facturas = await prisma.factura.findMany({
		where: { estado: "emitida" },
		select: {
			clienteId: true,
			cliente: { select: { nombreCompleto: true } },
			total: true,
			vence: true,
			pagos: { select: { monto: true } },
		},
	});

	const hoyStr = hoy();
	const porCliente = new Map<
		string,
		{ nombre: string; saldo: bigint; vencido: bigint; facturas: number; diasMaxAtraso: number }
	>();

	for (const f of facturas) {
		const pagado = f.pagos.reduce((s, p) => s + aCentavos(p.monto), 0n);
		const saldo = aCentavos(f.total) - pagado;
		if (saldo <= 0n) continue;

		const dias = f.vence ? diasEntre(fechaEnZona(f.vence), hoyStr) : 0;
		const vencido = dias > 0 ? saldo : 0n;

		if (!porCliente.has(f.clienteId)) {
			porCliente.set(f.clienteId, { nombre: f.cliente.nombreCompleto, saldo: 0n, vencido: 0n, facturas: 0, diasMaxAtraso: 0 });
		}
		const bucket = porCliente.get(f.clienteId)!;
		bucket.saldo += saldo;
		bucket.vencido += vencido;
		bucket.facturas += 1;
		if (dias > bucket.diasMaxAtraso) bucket.diasMaxAtraso = dias;
	}

	return [...porCliente.entries()]
		.sort(([, a], [, b]) => Number(b.saldo - a.saldo))
		.slice(0, 10)
		.map(([clienteId, b]) => ({
			clienteId,
			cliente: b.nombre,
			facturas: b.facturas,
			saldo: pesos(b.saldo),
			vencido: pesos(b.vencido),
			diasMaxAtraso: b.diasMaxAtraso,
		}));
}

export async function getDashboardCobranza() {
	const [aging, deudores] = await Promise.all([carteraPorAntiguedadDetallada(), topDeudores()]);
	return { aging, deudores };
}
