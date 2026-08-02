import { error, fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { hoy, isVista, parseFecha, sumarDias } from "$lib/agenda";
import { NAV } from "$lib/nav";
import { can } from "$lib/roles";
import { CitaError, agenda, crearCita, resumenAgenda } from "$lib/server/citas";
import { requireUser } from "$lib/server/guard";
import { listUsers } from "$lib/server/users";

/**
 * /panel is the dashboard: counters over the week calendar.
 *
 * A role without `cita:read` keeps the old behaviour and is sent to the first section it can
 * open — which is why the redirect below skips `/panel` itself, or it would bounce forever.
 */
export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requireUser(locals);

	if (!can(actor.role, "cita:read")) {
		const first = NAV.find((item) => item.href !== "/panel" && can(actor.role, item.permission));
		if (!first) error(403, "Tu rol todavía no tiene secciones asignadas.");
		redirect(303, first.href);
	}

	const vistaParam = url.searchParams.get("vista");
	const vista = isVista(vistaParam) ? vistaParam : "semana";
	const fecha = parseFecha(url.searchParams.get("fecha")) ?? hoy();
	// Resolved from the session, never from the URL — "mine" has to mean the caller.
	const mias = url.searchParams.get("mias") === "1";

	const [datos, resumen] = await Promise.all([
		agenda(vista, fecha, mias ? actor.id : null),
		resumenAgenda(),
	]);

	// Only fetched when the actor could actually assign somebody — one less query, and the
	// picker is never populated for a role the server would refuse anyway.
	const asignables = can(actor.role, "cita:assign")
		? (await listUsers())
				.filter((u) => u.active)
				.map((u) => ({ id: u.id, name: u.name, roleLabel: u.roleLabel }))
		: [];

	return {
		...datos,
		resumen,
		asignables,
		// Navigation, precomputed so the template stays markup. The week is a rolling seven days
		// from the anchor, so stepping moves the whole window.
		anterior: sumarDias(fecha, vista === "dia" ? -1 : -7),
		siguiente: sumarDias(fecha, vista === "dia" ? 1 : 7),
		hoy: hoy(),
		mias,
		puede: {
			crear: can(actor.role, "cita:create"),
			asignar: can(actor.role, "cita:assign"),
		},
	};
};

export const actions: Actions = {
	/** Book at the counter. Same shared function the API route calls (Rule 4). */
	crear: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;

		try {
			await crearCita({ actor, body });
			return { creada: true };
		} catch (err) {
			if (err instanceof CitaError) return fail(err.status, { message: err.message, valores: body });
			throw err;
		}
	},
};
