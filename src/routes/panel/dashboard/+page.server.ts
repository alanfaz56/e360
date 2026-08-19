import type { ServerLoad } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import { requirePermission } from "$lib/server/guard";
import { fallaEnCarga } from "$lib/server/errores";
import { periodoAnterior, resolverPeriodo } from "$lib/server/dashboard-periodo";
import { RANGO_OPCIONES } from "$lib/dashboard-constantes";
import { getDashboardResumen } from "$lib/server/dashboard/resumen";
import { getDashboardVentas } from "$lib/server/dashboard/ventas";
import { getDashboardOperacion, getDashboardTiempos } from "$lib/server/dashboard/operacion";
import { getDashboardCotizaciones } from "$lib/server/dashboard/cotizaciones";
import { getDashboardRentabilidad } from "$lib/server/dashboard/rentabilidad";
import { getDashboardMecanicos } from "$lib/server/dashboard/mecanicos";
import { getDashboardTalleres } from "$lib/server/dashboard/talleres";
import { getDashboardInventario } from "$lib/server/dashboard/inventario";
import { getDashboardCobranza } from "$lib/server/dashboard/cobranza";
import { getDashboardClientes } from "$lib/server/dashboard/clientes";
import { getDashboardVehiculos } from "$lib/server/dashboard/vehiculos";
import { getDashboardCitas } from "$lib/server/dashboard/citas";
import { getDashboardGarantias } from "$lib/server/dashboard/garantias";
import { getDashboardAlertas } from "$lib/server/dashboard/alertas";

/**
 * The manager dashboard: money → operación → problemas → tendencias → detalle (PRD §3).
 *
 * `resumen`/`operacion`/`alertas` — the "<30s" data — resolve inline in `load`. The heavier
 * detail-table modules (rentabilidad, clientes, inventario) are returned as unresolved promises
 * and streamed: SvelteKit renders the fast half immediately and each `{#await}` fills in once its
 * own query lands, rather than making the whole page wait on the slowest one.
 */
export const load: ServerLoad = async ({ locals, url }) => {
	requirePermission(locals, "dashboard:ver");

	const periodo = resolverPeriodo(url.searchParams);
	const anterior = periodoAnterior(periodo);
	const tallerId = url.searchParams.get("taller") || null;
	const mecanicoId = url.searchParams.get("mecanico") || null;
	const filtroOperacion = { tallerId, mecanicoId };

	try {
		const [talleresOpciones, mecanicosOpciones, resumen, operacion, tiempos, ventas, cotizaciones, inventario] =
			await Promise.all([
				prisma.taller.findMany({ where: { esInterno: false, archivedAt: null }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
				prisma.user.findMany({ where: { role: "taller" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
				getDashboardResumen(periodo, anterior),
				getDashboardOperacion(filtroOperacion),
				getDashboardTiempos(filtroOperacion),
				getDashboardVentas(periodo),
				getDashboardCotizaciones(periodo),
				getDashboardInventario(periodo),
			]);

		const alertas = await getDashboardAlertas({
			notasAtrasadas: operacion.atrasadas,
			listasParaEntregar: operacion.listasParaEntregar,
			productosBajoMinimo: inventario.bajoMinimo.length,
			solicitudesPendientes: inventario.solicitudesPendientes,
			tallerExterno: operacion.enTaller,
		});

		return {
			periodo,
			filtros: { taller: tallerId, mecanico: mecanicoId },
			rangoOpciones: RANGO_OPCIONES,
			talleresOpciones,
			mecanicosOpciones,
			resumen,
			operacion,
			tiempos,
			ventas,
			cotizaciones,
			inventario,
			alertas,
			cobranza: getDashboardCobranza(),
			rentabilidad: getDashboardRentabilidad(periodo),
			mecanicos: getDashboardMecanicos(periodo),
			talleres: getDashboardTalleres(periodo),
			clientes: getDashboardClientes(periodo),
			vehiculos: getDashboardVehiculos(periodo),
			citas: getDashboardCitas(periodo),
			garantias: getDashboardGarantias(periodo),
		};
	} catch (err) {
		fallaEnCarga(err);
	}
};
