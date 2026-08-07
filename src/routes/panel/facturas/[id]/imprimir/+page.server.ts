import type { ServerLoad } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import { getFactura, publicFactura } from "$lib/server/comercial";
import { fallaEnCarga } from "$lib/server/errores";
import { requirePermission } from "$lib/server/guard";

/**
 * An invoice, laid out to print. `factura:read`.
 *
 * This is the shop's own printout, not the CFDI: a stamped invoice's legal document comes from the
 * PAC as a real PDF plus its XML (`/api/facturas/[id]/documento`). Both exist because they answer
 * different questions — one is what the customer signs at the counter, the other is what the SAT
 * and their accountant recognise.
 */
export const load: ServerLoad = async ({ locals, params }) => {
	requirePermission(locals, "factura:read");

	try {
		const factura = publicFactura(await getFactura(params.id!));
		const cliente = await prisma.cliente.findUnique({
			where: { id: factura.clienteId },
			select: { nombreCompleto: true, rfc: true, direccion: true, telefono: true },
		});
		const nota = factura.notaId
			? await prisma.nota_servicio.findUnique({
					where: { id: factura.notaId },
					select: { unidad: { select: { marca: true, modelo: true, anio: true, placas: true } } },
				})
			: null;

		return {
			factura,
			cliente: {
				nombre: cliente?.nombreCompleto ?? factura.clienteNombre ?? "",
				rfc: cliente?.rfc ?? factura.clienteRfc,
				direccion: cliente?.direccion ?? null,
				telefono: cliente?.telefono ?? null,
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
		};
	} catch (err) {
		fallaEnCarga(err);
	}
};
