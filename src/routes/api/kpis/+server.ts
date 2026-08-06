import { json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { kpisPara } from "$lib/server/kpis";

/**
 * GET /api/kpis — the home dashboard's numbers for the CALLER.
 *
 * No permission of its own: each block is gated by the permission of the data it summarises, so
 * a role never receives a number it could not open. Two people hitting this get different
 * payloads, which is the point.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const actor = requireUser(locals);
	return json({ bloques: await kpisPara(actor) });
};
