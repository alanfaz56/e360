import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { crearCotizacion, listCotizaciones, publicCotizacion } from "$lib/server/comercial";

/** GET /api/notas/[id]/cotizaciones — quotes on this note. Permission: `cotizacion:read`. */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	requirePermission(locals, "cotizacion:read");
	return json(
		await listCotizaciones({
			notaId: params.id!,
			page: Number(url.searchParams.get("page")) || 1,
			perPage: Number(url.searchParams.get("perPage")) || 25,
		}),
	);
};

/**
 * POST /api/notas/[id]/cotizaciones — draft a quote. Permission: `cotizacion:create`.
 * Body: { conceptos: [{ tipo, descripcion, cantidad, precioUnitario }], vigenciaHasta?, notas? }
 *
 * Totals are RECOMPUTED from the line items — a total sent by a client is a number nobody checked.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cotizacion = await crearCotizacion({ actor, notaId: params.id!, body });
		return json({ cotizacion: publicCotizacion(cotizacion) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
