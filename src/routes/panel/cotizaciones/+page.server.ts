import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import {
	COTIZACION_ESTADOS,
	COTIZACION_ESTADO_KEYS,
	COTIZACION_INTERNOS,
	COTIZACION_INTERNO_KEYS,
} from "$lib/comercial";
import { hoy, sumarDias } from "$lib/agenda";
import { conFlash } from "$lib/flash";
import { can } from "$lib/roles";
import { fallaEnCarga, fallo } from "$lib/server/errores";
import { requirePermission, requireUser } from "$lib/server/guard";
import {
	listCotizaciones,
	listFacturas,
	reenviarCotizacionCorreo,
	resumenDinero,
	utilidadDeCotizacion,
} from "$lib/server/comercial";

/**
 * The money screen: quotes and invoices over a period, on both axes.
 *
 * This is the question a single note cannot answer. "What did the customer approve that we still
 * have not collected" is about the shop, not about one vehicle, and asking it one note at a time is
 * not asking it at all. Same shared functions the API routes call (Rule 4).
 *
 * **The default window is the last 30 days**, not all time: a shop's money question is almost
 * always about a period, and an unbounded list gets slower every month it runs.
 */
export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requirePermission(locals, "cotizacion:read");

	const estado = url.searchParams.get("estado") ?? "";
	const estadoInterno = url.searchParams.get("estadoInterno") ?? "";
	const desde = url.searchParams.get("desde") || sumarDias(hoy(), -30);
	const hasta = url.searchParams.get("hasta") || hoy();
	const pestana = url.searchParams.get("ver") === "facturas" ? "facturas" : "cotizaciones";
	// A 60-day-overdue invoice was likely CREATED well outside the default 30-day window, so
	// "vencidas" drops the date filter entirely rather than silently hiding the very rows it's
	// asking for.
	const vencidas = url.searchParams.get("vencidas") === "1";

	try {
		const [cotizaciones, facturas, dinero] = await Promise.all([
			listCotizaciones({
				estado,
				estadoInterno,
				desde,
				hasta,
				page: pestana === "cotizaciones" ? Number(url.searchParams.get("page") ?? 1) || 1 : 1,
				perPage: 25,
			}),
			// The invoice half of the same window. Loaded either way so the tab count is honest
			// before you click it — a tab that says nothing until opened is a tab nobody opens.
			can(actor.role, "factura:read")
				? listFacturas({
						...(vencidas ? { vencidas: true } : { desde, hasta }),
						page: pestana === "facturas" ? Number(url.searchParams.get("page") ?? 1) || 1 : 1,
						perPage: 25,
					})
				: null,
			resumenDinero(desde, hasta),
		]);

		// Admin-only, and only for the page actually on screen — the list is capped at 25, so this
		// is at most 25 extra reads, not a query over the whole filtered window.
		const utilidades: Record<string, Awaited<ReturnType<typeof utilidadDeCotizacion>>> = {};
		if (can(actor.role, "cotizacion:costo")) {
			for (const c of cotizaciones.cotizaciones) {
				utilidades[c.id] = await utilidadDeCotizacion(actor, c.id);
			}
		}

		return {
			...cotizaciones,
			facturas: facturas?.facturas ?? [],
			facturasTotal: facturas?.total ?? 0,
			facturasPages: facturas?.totalPages ?? 1,
			dinero,
			utilidades,
			pestana,
			filtros: { estado, estadoInterno, desde, hasta },
			estados: COTIZACION_ESTADO_KEYS.map((k) => ({ value: k, label: COTIZACION_ESTADOS[k].label })),
			internos: COTIZACION_INTERNO_KEYS.map((k) => ({ value: k, label: COTIZACION_INTERNOS[k].label })),
			puede: {
				verFacturas: can(actor.role, "factura:read"),
				timbrar: can(actor.role, "factura:timbrar"),
				enviarCotizacion: can(actor.role, "cotizacion:send"),
				verUtilidad: can(actor.role, "cotizacion:costo"),
			},
		};
	} catch (err) {
		fallaEnCarga(err);
	}
};

export const actions: Actions = {
	/** Same shared function the nota detail's "Reenviar correo" button calls (Rule 4/5). */
	reenviarCotizacionCorreo: async ({ locals, request, url }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await reenviarCotizacionCorreo({ actor, id: String(data.get("cotizacionId")) });
			redirect(303, conFlash(`/panel/cotizaciones${url.search}`, "cotizacion.reenviar"));
		} catch (err) {
			return fallo(err);
		}
	},
};
