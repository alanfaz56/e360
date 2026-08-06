import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { cambiarEstadoCotizacion, publicCotizacion } from "$lib/server/comercial";

/**
 * POST /api/cotizaciones/[id]/estado — send it, or record the customer's answer.
 * Body: { estado, contactoId?, medio?, motivo? }
 *
 * Sending needs `cotizacion:send` (Admin/Gerente); recording the answer needs
 * `cotizacion:authorize`, which the Operador at the counter also holds.
 *
 * Authorizing records WHO approved on the customer's side: a contact holding `autorizador`. An
 * organización cannot approve its own quote — that is the entire reason the role exists.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const cotizacion = await cambiarEstadoCotizacion({
			actor,
			id: params.id!,
			estado: body.estado,
			body,
		});
		return json({ cotizacion: publicCotizacion(cotizacion) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
