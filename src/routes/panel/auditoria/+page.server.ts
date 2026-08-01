import type { ServerLoad } from "@sveltejs/kit";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "$lib/audit-actions";
import { requirePermission } from "$lib/server/guard";
import { parseAuditQuery, queryAuditLogs } from "$lib/server/audit";

/** Same filters as GET /api/audit-logs — both parse the query string with `parseAuditQuery`. */
export const load: ServerLoad = async ({ locals, url }) => {
	requirePermission(locals, "audit:read");

	const query = parseAuditQuery(url.searchParams);
	const result = await queryAuditLogs(query);

	return {
		...result,
		filters: {
			action: query.action ?? "",
			entity: query.entity ?? "",
			actor: query.actor ?? "",
			q: query.q ?? "",
			desde: query.desde ?? "",
			hasta: query.hasta ?? "",
		},
		actions: Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label })),
		entities: AUDIT_ENTITIES,
	};
};
