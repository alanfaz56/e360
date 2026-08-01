import { json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";
import { listUsers } from "$lib/server/users";

/** GET /api/users — staff list. Permission: `user:list`. */
export const GET: RequestHandler = async ({ locals }) => {
	requirePermission(locals, "user:list");
	return json({ users: await listUsers() });
};
