import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { crearCotizacion, listCotizaciones, publicCotizacion } from "$lib/server/comercial";

/**
 * GET /api/cotizaciones — quotes across every job. Permission: `cotizacion:read`.
 * Params: notaId, estado (customer's answer), estadoInterno (the shop's track), page, perPage.
 *
 * The per-note list already lives at `/api/notas/[id]/cotizaciones`; this is the cross-cutting
 * one — "everything authorised but not yet collected" is a question about the shop, not about a
 * single vehicle, and it cannot be asked one note at a time.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "cotizacion:read");
	return json(
		await listCotizaciones({
			notaId: url.searchParams.get("notaId"),
			clienteId: url.searchParams.get("clienteId"),
			estado: url.searchParams.get("estado"),
			estadoInterno: url.searchParams.get("estadoInterno"),
			page: Number(url.searchParams.get("page") ?? 1) || 1,
			perPage: Math.min(Number(url.searchParams.get("perPage") ?? 25) || 25, 100),
		}),
	);
};

/**
 * POST /api/cotizaciones — draft a pre-arrival quote owned directly by a customer.
 * Body: { clienteId, unidadId?, conceptos, vigenciaHasta?, notas? }.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
	try {
		const cotizacion = await crearCotizacion({
			actor,
			clienteId: typeof body.clienteId === "string" ? body.clienteId : null,
			unidadId: typeof body.unidadId === "string" ? body.unidadId : null,
			body,
		});
		return json({ cotizacion: publicCotizacion(cotizacion) }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
