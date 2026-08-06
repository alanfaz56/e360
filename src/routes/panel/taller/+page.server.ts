import type { ServerLoad } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";
import { misNotas } from "$lib/server/notas";

/**
 * The mechanic's whole app: the units assigned to them, and nothing else.
 *
 * Scoped by `mecanicoId` inside `misNotas`, not by filtering a full list here — a mechanic holds
 * `nota:asignadas`, not `nota:read`, and that difference has to be a different query or it is not
 * a boundary.
 */
export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requirePermission(locals, "nota:asignadas");
	const cerradas = url.searchParams.get("cerradas") === "1";

	return { notas: await misNotas(actor, { cerradas }), cerradas, yo: actor.name };
};
