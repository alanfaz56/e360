import { json, type RequestHandler } from "@sveltejs/kit";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "$lib/audit-actions";
import { requirePermission } from "$lib/server/guard";
import { parseAuditQuery, queryAuditLogs } from "$lib/server/audit";

/**
 * GET /api/audit-logs — the audit trail. Permission: `audit:read` (Admin only).
 *
 * Query params, all optional and combinable:
 *   action=user.role_change   exact action key
 *   entity=user               entity family
 *   entityId=<id>             everything that happened to one record
 *   actor=alan@               actor email, partial match
 *   q=texto                   free text over summary, entity label and actor email
 *   desde=2026-08-01          inclusive; a bare date counts from 00:00
 *   hasta=2026-08-31          inclusive; a bare date counts to 23:59:59.999
 *   page=1&perPage=25         perPage is capped at 100
 *
 * The response carries `actions` and `entities` so an integrator can build a filter UI
 * without hardcoding the registry.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "audit:read");

	const result = await queryAuditLogs(parseAuditQuery(url.searchParams));

	return json({
		...result,
		actions: Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label })),
		entities: AUDIT_ENTITIES,
	});
};
