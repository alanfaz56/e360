import { error, redirect, type ServerLoad } from "@sveltejs/kit";
import { NAV } from "$lib/nav";
import { can } from "$lib/roles";
import { requireUser } from "$lib/server/guard";

/** /panel has no content of its own — send each role to the first section it can open. */
export const load: ServerLoad = async ({ locals }) => {
	const actor = requireUser(locals);
	const first = NAV.find((item) => can(actor.role, item.permission));
	if (!first) error(403, "Tu rol todavía no tiene secciones asignadas.");
	redirect(303, first.href);
};
