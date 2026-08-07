import type { ServerLoad } from "@sveltejs/kit";
import prisma from "$lib/prisma";
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
		const cotizacion = publicCotizacion(await getCotizacion(params.id!));
		const nota = await prisma.nota_servicio.findUnique({
			where: { id: cotizacion.notaId },
			select: {
				folio: true,
				cliente: { select: { nombreCompleto: true, rfc: true, direccion: true, telefono: true } },
				unidad: { select: { marca: true, modelo: true, anio: true, placas: true } },
			},
		});

		return {
			cotizacion,
			cliente: {
				nombre: nota?.cliente?.nombreCompleto ?? cotizacion.clienteNombre ?? "",
				rfc: nota?.cliente?.rfc ?? null,
				direccion: nota?.cliente?.direccion ?? null,
				telefono: nota?.cliente?.telefono ?? null,
			},
			unidad: nota?.unidad
				? [
						`${nota.unidad.marca} ${nota.unidad.modelo}`,
						nota.unidad.anio ? String(nota.unidad.anio) : null,
						nota.unidad.placas,
					]
						.filter(Boolean)
						.join(" · ")
				: null,
			notaFolio: nota?.folio ?? null,
		};
	} catch (err) {
		fallaEnCarga(err);
	}
};
