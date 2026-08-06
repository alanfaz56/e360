import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requirePermission, requireUser } from "$lib/server/guard";
import { createSucursal, getTallerDetalle } from "$lib/server/talleres";

/** GET /api/talleres/[id]/sucursales — branches of one workshop. `taller:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "taller:read");
	try {
		const taller = await getTallerDetalle(params.id!);
		return json({ sucursales: taller.sucursales ?? [] });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * POST /api/talleres/[id]/sucursales — add a branch. `taller:manage`.
 *
 * `esPrincipal: true` demotes whatever branch currently holds it, in the same transaction — the
 * partial unique index would otherwise reject the write.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const sucursal = await createSucursal({ actor, tallerId: params.id!, body });
		return json({ sucursal }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
