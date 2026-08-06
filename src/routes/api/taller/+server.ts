import { json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";
import { misNotas } from "$lib/server/notas";
import { buscarParaTaller } from "$lib/server/productos";

/**
 * GET /api/taller — the mechanic's own work. Permission: `nota:asignadas`.
 * Params: cerradas=1 to include finished jobs, q= to search the parts they can ask for.
 *
 * Scoped by `mecanicoId` in the query, never by filtering a full list afterwards: a mechanic holds
 * `nota:asignadas`, not `nota:read`, and the difference has to be a different query or it is not a
 * boundary at all.
 *
 * The product search returns names and stock only — never a price. What the shop charges is not
 * the mechanic's decision, which is exactly why `producto:read` is not one of their permissions.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const actor = requirePermission(locals, "nota:asignadas");

	const q = url.searchParams.get("q");
	if (q !== null) return json({ productos: await buscarParaTaller(q) });

	return json({ notas: await misNotas(actor, { cerradas: url.searchParams.get("cerradas") === "1" }) });
};
