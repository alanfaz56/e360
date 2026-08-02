import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { auditActionLabel, type AuditAction } from "$lib/audit-actions";
import { DEFAULT_PAGE_SIZE, pageMeta, parseDate, parsePageParams, skipFor } from "./paginate";
import type { Actor } from "./guard";

/** Anything Prisma can run a query on — the client itself or a transaction handle. */
type Db = Pick<typeof prisma, "audit_log">;

export const AUDIT_PAGE_SIZE = DEFAULT_PAGE_SIZE;

/**
 * Append one entry to the audit trail.
 *
 * Pass the transaction handle as `db` when the audited write is itself in a transaction,
 * so the log entry and the change commit or roll back together. A change that committed
 * without its audit row, or an audit row for a change that rolled back, are both lies.
 *
 * Never put passwords, password hashes or raw invite tokens in `before`/`after`.
 */
export async function recordAudit(
	db: Db,
	entry: {
		action: AuditAction;
		/**
		 * `id` is nullable because the public appointment form has no user behind it. The trail
		 * still records the write — an unaudited anonymous endpoint would be the easiest thing in
		 * the system to abuse quietly — with `email` naming the channel it came through.
		 */
		actor: { id: string | null; email: string };
		entityId?: string | null;
		entityLabel?: string | null;
		summary?: string | null;
		before?: Prisma.InputJsonValue | null;
		after?: Prisma.InputJsonValue | null;
	},
) {
	return db.audit_log.create({
		data: {
			id: randomUUID(),
			action: entry.action,
			entity: entry.action.split(".")[0],
			entityId: entry.entityId ?? null,
			// Snapshots, so the record still reads correctly after the row or the actor is gone.
			entityLabel: entry.entityLabel ?? null,
			actorId: entry.actor.id,
			actorEmail: entry.actor.email,
			summary: entry.summary ?? null,
			before: entry.before ?? undefined,
			after: entry.after ?? undefined,
		},
	});
}

export type AuditQuery = {
	action?: string | null;
	entity?: string | null;
	entityId?: string | null;
	actor?: string | null;
	/** Free text across summary, entity label and actor email. */
	q?: string | null;
	desde?: string | null;
	hasta?: string | null;
	page?: number;
	perPage?: number;
};

/** Parse query params into an AuditQuery. Shared by the API route and the page load. */
export function parseAuditQuery(params: URLSearchParams): AuditQuery {
	return {
		action: params.get("action"),
		entity: params.get("entity"),
		entityId: params.get("entityId"),
		actor: params.get("actor"),
		q: params.get("q"),
		desde: params.get("desde"),
		hasta: params.get("hasta"),
		...parsePageParams(params, AUDIT_PAGE_SIZE),
	};
}

/**
 * Paginated, filterable read of the audit trail.
 * Caller MUST have checked `audit:read` first — this does not re-derive authority.
 */
export async function queryAuditLogs(query: AuditQuery) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? AUDIT_PAGE_SIZE };

	const desde = parseDate(query.desde);
	const hasta = parseDate(query.hasta, true);

	const where: Prisma.audit_logWhereInput = {
		...(query.action ? { action: query.action } : {}),
		...(query.entity ? { entity: query.entity } : {}),
		...(query.entityId ? { entityId: query.entityId } : {}),
		...(query.actor ? { actorEmail: { contains: query.actor, mode: "insensitive" } } : {}),
		...(desde || hasta ? { createdAt: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
		...(query.q
			? {
					OR: [
						{ summary: { contains: query.q, mode: "insensitive" } },
						{ entityLabel: { contains: query.q, mode: "insensitive" } },
						{ actorEmail: { contains: query.q, mode: "insensitive" } },
					],
				}
			: {}),
	};

	const [total, rows] = await Promise.all([
		prisma.audit_log.count({ where }),
		prisma.audit_log.findMany({
			where,
			orderBy: { createdAt: "desc" },
			skip: skipFor(paging),
			take: paging.perPage,
		}),
	]);

	return {
		logs: rows.map((row) => ({
			id: row.id,
			action: row.action,
			actionLabel: auditActionLabel(row.action),
			entity: row.entity,
			entityId: row.entityId,
			entityLabel: row.entityLabel,
			actorEmail: row.actorEmail,
			summary: row.summary,
			before: row.before,
			after: row.after,
			createdAt: row.createdAt.toISOString(),
		})),
		...pageMeta(total, paging),
	};
}
