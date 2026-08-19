/**
 * §7 — Estado del taller ahora mismo, y §8 — tiempos de reparación.
 *
 * Only two of the PRD's four intervals are computed: recepción→entrega and terminado→entrega.
 * `nota_servicio` has no `diagnosticoAt` column, and `trabajoTerminadoAt` is per-nota while a nota
 * can carry several cotizaciones with different `autorizadaAt` — pairing one to the other would be
 * inventing which quote's authorization "started" the work. Not implemented, per PRD §8/Rule 5.
 */
import prisma from "$lib/prisma";
import { NOTA_ESTADOS_ABIERTOS, NOTA_ESTADO_KEYS, notaEstadoLabel } from "$lib/notas";
import { diasEntre, enZona, fechaEnZona, hoy, sumarDias } from "$lib/agenda";
import { DIAS_NOTA_ATRASADA } from "$lib/dashboard-constantes";

export async function getDashboardOperacion(filtro: { tallerId?: string | null; mecanicoId?: string | null }) {
	const scope = {
		...(filtro.tallerId ? { tallerActualId: filtro.tallerId } : {}),
		...(filtro.mecanicoId ? { mecanicoId: filtro.mecanicoId } : {}),
	};

	const [porEstado, atrasadas, esperandoAutorizacion, esperandoRefaccion] = await Promise.all([
		prisma.nota_servicio.groupBy({ by: ["estado"], where: scope, _count: true }),
		prisma.nota_servicio.count({
			where: { ...scope, estado: { in: NOTA_ESTADOS_ABIERTOS }, recibidaAt: { lt: enZona(sumarDias(hoy(), -DIAS_NOTA_ATRASADA)) } },
		}),
		prisma.cotizacion.count({ where: { estado: "enviada", nota: { estado: { in: NOTA_ESTADOS_ABIERTOS }, ...scope } } }),
		prisma.solicitud_refaccion.count({ where: { estado: "pendiente", nota: scope } }),
	]);

	const cuenta = new Map(porEstado.map((f) => [f.estado, f._count]));
	const estados = NOTA_ESTADO_KEYS.map((estado) => ({
		key: estado,
		label: notaEstadoLabel(estado),
		value: cuenta.get(estado) ?? 0,
	}));

	return {
		estados,
		enTaller: cuenta.get("en_taller") ?? 0,
		listasParaEntregar: cuenta.get("lista") ?? 0,
		atrasadas,
		esperandoAutorizacion,
		esperandoRefaccion,
	};
}

export async function getDashboardTiempos(filtro: { tallerId?: string | null; mecanicoId?: string | null }) {
	const scope = {
		...(filtro.tallerId ? { tallerActualId: filtro.tallerId } : {}),
		...(filtro.mecanicoId ? { mecanicoId: filtro.mecanicoId } : {}),
	};

	const [entregadas, abiertas] = await Promise.all([
		prisma.nota_servicio.findMany({
			where: { ...scope, estado: "entregada", entregadaAt: { not: null } },
			select: { recibidaAt: true, trabajoTerminadoAt: true, entregadaAt: true },
			orderBy: { entregadaAt: "desc" },
			take: 500, // bounded window — the dashboard reads a trend, not the whole history
		}),
		prisma.nota_servicio.findMany({
			where: { ...scope, estado: { in: NOTA_ESTADOS_ABIERTOS } },
			select: { recibidaAt: true },
		}),
	]);

	const recepcionEntrega = entregadas.map((n) => diasEntre(fechaEnZona(n.recibidaAt), fechaEnZona(n.entregadaAt!)));
	const terminadoEntrega = entregadas
		.filter((n) => n.trabajoTerminadoAt)
		.map((n) => diasEntre(fechaEnZona(n.trabajoTerminadoAt!), fechaEnZona(n.entregadaAt!)));

	const stats = (xs: number[]) => {
		if (xs.length === 0) return { promedio: null, mediana: null, max: null };
		const ordenado = [...xs].sort((a, b) => a - b);
		const mid = Math.floor(ordenado.length / 2);
		const mediana = ordenado.length % 2 ? ordenado[mid]! : (ordenado[mid - 1]! + ordenado[mid]!) / 2;
		return {
			promedio: Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10,
			mediana,
			max: ordenado[ordenado.length - 1]!,
		};
	};

	const hoyStr = hoy();
	const permanencia =
		abiertas.length > 0
			? Math.round((abiertas.reduce((s, n) => s + diasEntre(fechaEnZona(n.recibidaAt), hoyStr), 0) / abiertas.length) * 10) / 10
			: null;

	return {
		recepcionEntrega: stats(recepcionEntrega),
		terminadoEntrega: stats(terminadoEntrega),
		permanenciaPromedio: permanencia,
	};
}
