import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { auditActionLabel, type AuditAction } from "$lib/audit-actions";
import type { Actor } from "./guard";

/** Anything Prisma can run a query on — the client itself or a transaction handle. */
type Db = Pick<typeof prisma, "audit_log">;

export const AUDIT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

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
		actor: Pick<Actor, "id" | "email">;
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
	const int = (raw: string | null, fallback: number) => {
		const n = Number(raw);
		return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
	};
	return {
		action: params.get("action"),
		entity: params.get("entity"),
		entityId: params.get("entityId"),
		actor: params.get("actor"),
		q: params.get("q"),
		desde: params.get("desde"),
		hasta: params.get("hasta"),
		page: int(params.get("page"), 1),
		perPage: Math.min(int(params.get("perPage"), AUDIT_PAGE_SIZE), MAX_PAGE_SIZE),
	};
}

/** A valid Date, or undefined. Keeps a typo'd date from silently filtering everything out. */
function parseDate(value: string | null | undefined, endOfDay = false): Date | undefined {
	if (!value) return undefined;
	const date = new Date(endOfDay && value.length === 10 ? `${value}T23:59:59.999` : value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Paginated, filterable read of the audit trail.
 * Caller MUST have checked `audit:read` first — this does not re-derive authority.
 */
export async function queryAuditLogs(query: AuditQuery) {
	const page = query.page ?? 1;
	const perPage = query.perPage ?? AUDIT_PAGE_SIZE;

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
			skip: (page - 1) * perPage,
			take: perPage,
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
		page,
		perPage,
		total,
		totalPages: Math.max(1, Math.ceil(total / perPage)),
	};
}
