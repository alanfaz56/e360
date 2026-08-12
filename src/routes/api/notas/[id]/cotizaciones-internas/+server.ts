import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { crearCotizacionInterna, listCotizacionesInternas } from "$lib/server/comercial";

/** GET /api/notas/[id]/cotizaciones-internas — cost estimates on this job. `cotizacion_interna:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const actor = requireUser(locals);
	try {
		return json({ cotizacionesInternas: await listCotizacionesInternas(actor, { notaId: params.id! }) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * POST /api/notas/[id]/cotizaciones-internas — submit a cost estimate. Permission:
 * `cotizacion_interna:create`. Body: `{ mecanicoId?, cotizacionId?, conceptos: [{ descripcion,
 * cantidad, costoUnitario, productoId? }] }`. Almost always Admin/Gerente typing in what a
 * mechanic reported — `taller` never reaches this route.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		return json(
			{ cotizacionInterna: await crearCotizacionInterna({ actor, notaId: params.id!, body }) },
			{ status: 201 },
		);
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
