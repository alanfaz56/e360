import { error, redirect, type ServerLoad } from "@sveltejs/kit";
import { NAV } from "$lib/nav";
import { can } from "$lib/roles";
import { kpisPara } from "$lib/server/kpis";
import { ultimosMovimientos } from "$lib/server/movimientos";
import { requireUser } from "$lib/server/guard";

/**
 * /panel is Home: the shop's numbers and nothing else.
 *
 * The calendar moved to /panel/agenda. Two different questions — "how are we doing" and "what is
 * coming in on Thursday" — were sharing one screen, which meant the agenda was always below a wall
 * of counters and the counters were always above a calendar nobody scrolled past.
 *
 * The gate is the KPIs themselves, not a permission: every block is already gated by the data it
 * summarises, so a role with no blocks has an empty home and is sent to the first section it can
 * actually open. That redirect must skip `/panel` or it loops forever.
 */
export const load: ServerLoad = async ({ locals }) => {
	const actor = requireUser(locals);
	const bloques = await kpisPara(actor);

	if (bloques.length === 0) {
		// Same filter the sidebar uses, `ocultarSi` included — otherwise a role could be redirected
		// to a screen its own menu deliberately hides. A mechanic lands on /panel/taller here.
		const first = NAV.find(
			(item) =>
				item.href !== "/panel" &&
				can(actor.role, item.permission) &&
				!(item.ocultarSi && can(actor.role, item.ocultarSi)),
		);
		if (!first) error(403, "Tu rol todavía no tiene secciones asignadas.");
		redirect(303, first.href);
	}

	const movimientos = can(actor.role, "movimientos:read") ? await ultimosMovimientos() : [];

	return {
		bloques,
		nombre: actor.name,
		puedeAgenda: can(actor.role, "cita:read"),
		movimientos,
	};
};
