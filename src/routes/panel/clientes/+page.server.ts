import type { ServerLoad } from "@sveltejs/kit";
import { can } from "$lib/roles";
import { requirePermission } from "$lib/server/guard";

export const load: ServerLoad = async ({ locals }) => {
	const actor = requirePermission(locals, "cliente:read");
	// ponytail: no `cliente` table yet — the screen is a shell. The permission gate is
	// real from day one so the route never ships unguarded.
	return { canCreate: can(actor.role, "cliente:create") };
};
