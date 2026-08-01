import { redirect, type ServerLoad } from "@sveltejs/kit";
import { NAV } from "$lib/nav";
import { ROLE_LABEL, can, permissionsFor } from "$lib/roles";
import { requireUser } from "$lib/server/guard";

export const load: ServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const actor = requireUser(locals);

	return {
		actor: { name: actor.name, email: actor.email, role: actor.role, roleLabel: ROLE_LABEL[actor.role] },
		permissions: permissionsFor(actor.role),
		// Filtered server-side: a role never receives links to screens it cannot open.
		nav: NAV.filter((item) => can(actor.role, item.permission)),
	};
};
