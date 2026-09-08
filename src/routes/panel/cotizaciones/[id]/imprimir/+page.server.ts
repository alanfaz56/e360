import type { ServerLoad } from "@sveltejs/kit";
import { getCotizacion, publicCotizacion } from "$lib/server/comercial";
import { fallaEnCarga } from "$lib/server/errores";
import { requirePermission } from "$lib/server/guard";

/**
 * A quote, laid out to print. `cotizacion:read`.
 *
 * The customer's fiscal details come off their record rather than the quote, because a printout is
 * generated now and the record is the current truth — unlike an invoice, a quote is not a document
 * whose contents were frozen at issue.
 */
export const load: ServerLoad = async ({ locals, params }) => {
	requirePermission(locals, "cotizacion:read");

	try {
		const fila = await getCotizacion(params.id!);
		const cotizacion = publicCotizacion(fila);

		return {
			cotizacion,
			cliente: {
				nombre: fila.cliente.nombreCompleto,
				rfc: fila.cliente.rfc,
				direccion: fila.cliente.direccion,
				telefono: fila.cliente.telefono,
			},
			unidad: fila.unidad
				? [
						`${fila.unidad.marca} ${fila.unidad.modelo}`,
						fila.unidad.anio ? String(fila.unidad.anio) : null,
						fila.unidad.placas,
					]
						.filter(Boolean)
						.join(" · ")
				: null,
			notaFolio: fila.nota?.folio ?? null,
		};
	} catch (err) {
		fallaEnCarga(err);
	}
};
