import { redirect, type ServerLoad } from "@sveltejs/kit";
import { NAV } from "$lib/nav";
import { ROLE_LABEL, can, permissionsFor } from "$lib/roles";
import { requireUser } from "$lib/server/guard";
import { contarNoLeidas, listarNotificaciones } from "$lib/server/notificaciones";

export const load: ServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const actor = requireUser(locals);

	// The badge needs one COUNT on every panel page; the list only when the drawer is actually
	// open. Reading `url` here is what makes SvelteKit re-run this load when `?drawer=` changes,
	// so opening the bell fetches the inbox and closing it stops paying for it.
	const abierto = url.searchParams.get("drawer") === "avisos";
	const bandeja = abierto
		? await listarNotificaciones(actor, { perPage: 20 })
		: { notificaciones: [], noLeidas: await contarNoLeidas(actor.id) };

	return {
		actor: { name: actor.name, email: actor.email, role: actor.role, roleLabel: ROLE_LABEL[actor.role] },
		permissions: permissionsFor(actor.role),
		// Filtered server-side: a role never receives links to screens it cannot open.
		nav: NAV.filter((item) => can(actor.role, item.permission)),
		avisos: bandeja.notificaciones,
		noLeidas: bandeja.noLeidas,
	};
};
