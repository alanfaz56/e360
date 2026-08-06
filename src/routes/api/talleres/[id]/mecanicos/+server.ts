import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requirePermission, requireUser } from "$lib/server/guard";
import { asignarMecanicoATaller, mecanicosDeTaller } from "$lib/server/talleres";

/**
 * The partner workshop's own crew — the people who actually have the vehicle.
 *
 * GET  — list them. Permission: `taller:read`.
 * POST — put somebody on the crew, or take them off with `{ userId, quitar: true }`.
 *        Permission: `taller:manage`.
 *
 * Only a `taller` role may belong to a workshop: an account with the counter's permissions AND an
 * outside shop's scope is not a thing that should exist. `asignarMecanicoATaller` refuses it, and
 * `user_taller_solo_rol_taller_check` refuses it again in the database.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "taller:read");
	return json({ mecanicos: await mecanicosDeTaller(params.id!) });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const usuario = await asignarMecanicoATaller({
			actor,
			userId: body.userId,
			tallerId: body.quitar === true ? null : params.id!,
		});
		return json({ usuario });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
