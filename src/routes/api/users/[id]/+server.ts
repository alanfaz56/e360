import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { UserError, changeUserRole, setUserLockout } from "$lib/server/users";

/**
 * PATCH /api/users/:id — change a user's role and/or lock them out.
 * Body: { role?: "admin" | "gerente" | "operador" | "taller", locked?: boolean, reason?: string }
 *
 * Permissions (`user:set-role`, `user:ban` — both Admin only) and the lockout guards live
 * inside the shared functions, not here, so the /panel form actions enforce the same rules.
 *
 * Both take effect on the target's existing session immediately: session cookie caching is
 * off, so every request re-reads role and banned state from the database. Locking also
 * deletes their sessions outright.
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = await request.json().catch(() => null);

	if (!body || (body.role === undefined && body.locked === undefined)) {
		error(400, "Se requiere `role` o `locked`");
	}

	try {
		const result: Record<string, unknown> = {};
		if (body.locked !== undefined) {
			if (typeof body.locked !== "boolean") error(400, "`locked` debe ser booleano");
			Object.assign(
				result,
				await setUserLockout({ actor, userId: params.id, locked: body.locked, reason: body.reason }),
			);
		}
		if (body.role !== undefined) {
			Object.assign(result, await changeUserRole({ actor, userId: params.id, role: body.role }));
		}
		return json(result);
	} catch (err) {
		if (err instanceof UserError) error(err.status, err.message);
		throw err;
	}
};
