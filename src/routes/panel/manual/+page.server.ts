import type { ServerLoad } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";

/**
 * Read-only. Gated on `nota:asignadas` — the one permission every role already holds (same key
 * "Mi trabajo" uses) — so this shows for admin/gerente/operador/taller alike without inventing an
 * "everyone" permission the registry doesn't have.
 */
export const load: ServerLoad = async ({ locals }) => {
	const actor = requirePermission(locals, "nota:asignadas");
	return { role: actor.role };
};
