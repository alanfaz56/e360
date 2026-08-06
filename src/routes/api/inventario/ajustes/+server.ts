import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requireUser } from "$lib/server/guard";
import { ajustarExistencia } from "$lib/server/inventario";
import { publicProducto } from "$lib/server/productos";

/**
 * POST /api/inventario/ajustes — set stock to a counted figure. Permission: `inventario:ajuste`.
 * Body: `{ productoId, nueva, motivo, costoUnitario? }`.
 *
 * **The motivo is mandatory**, here and in `inventario_ajuste_motivo_check`. An adjustment with no
 * reason is shrinkage nobody will ever explain. An increase opens a layer — stock with no cost
 * behind it makes every later margin wrong.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

	try {
		const producto = await ajustarExistencia({
			actor,
			productoId: String(body.productoId ?? ""),
			nueva: body.nueva,
			motivo: body.motivo,
			costoUnitario: body.costoUnitario,
		});
		return json({ producto: publicProducto(producto) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
