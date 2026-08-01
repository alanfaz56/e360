import { json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ROLE_LABEL, assignableRoles, permissionsFor } from "$lib/roles";

/**
 * GET /api/me — the caller's identity, role and effective permissions.
 * Integration entry point: an external program authenticates once and reads this to
 * learn what it is allowed to call, instead of hardcoding the role table.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const actor = requireUser(locals);
	return json({
		id: actor.id,
		email: actor.email,
		name: actor.name,
		role: actor.role,
		roleLabel: ROLE_LABEL[actor.role],
		permissions: permissionsFor(actor.role),
		assignableRoles: assignableRoles(actor.role),
	});
};
