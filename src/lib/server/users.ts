import prisma from "$lib/prisma";
import { auth } from "$lib/auth";
import { ROLE_LABEL, can, isRole, type Role } from "$lib/roles";
import { queryAuditLogs, recordAudit } from "./audit";
import type { Actor } from "./guard";

/** Thrown for anything the caller did wrong; routes map `.status` straight to HTTP. */
export class UserError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

/**
 * Staff list. Shared by GET /api/users and the /panel/usuarios page so both return the
 * same shape — the API is the contract, the page is just another client of it.
 */
export async function listUsers() {
	const users = await prisma.user.findMany({
		orderBy: { createdAt: "asc" },
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
			banned: true,
			createdAt: true,
		},
	});

	// Explicit mapper: never spread a Prisma row into JSON, or the next migration leaks
	// whatever column it adds.
	return users.map((user) => ({
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		roleLabel: ROLE_LABEL[user.role as Role] ?? "Sin rol",
		active: !user.banned,
		createdAt: user.createdAt.toISOString(),
	}));
}

/**
 * Lock a user out, or let them back in.
 *
 * A locked user keeps their account and history but cannot use the system: `requireUser`
 * rejects them on every request, and their sessions are deleted here so an open browser
 * tab is cut off immediately rather than at the next login.
 *
 * Same two lockout guards as `changeUserRole`: you cannot lock yourself out, and the last
 * remaining active Admin cannot be locked out.
 */
export async function setUserLockout(input: {
	actor: Actor;
	userId: unknown;
	locked: boolean;
	reason?: unknown;
}) {
	const { actor } = input;

	if (!can(actor.role, "user:ban")) throw new UserError(403, "Sin permiso: user:ban");
	if (typeof input.userId !== "string" || !input.userId) {
		throw new UserError(400, "Se requiere `userId`");
	}
	if (input.userId === actor.id) {
		throw new UserError(403, "No puedes bloquear tu propia cuenta.");
	}

	const reason =
		typeof input.reason === "string" && input.reason.trim() ? input.reason.trim().slice(0, 255) : null;

	return prisma.$transaction(async (tx) => {
		// Same lock as changeUserRole — see the comment there for why it is load-bearing.
		await tx.$queryRaw`SELECT id FROM "user" WHERE role = 'admin' AND (banned IS NOT TRUE) FOR UPDATE`;

		const target = await tx.user.findUnique({
			where: { id: input.userId as string },
			select: { id: true, name: true, email: true, role: true, banned: true },
		});
		if (!target) throw new UserError(404, "Usuario no encontrado");
		if (Boolean(target.banned) === input.locked) {
			throw new UserError(409, input.locked ? "El usuario ya está bloqueado." : "El usuario no está bloqueado.");
		}

		await tx.user.update({
			where: { id: target.id },
			data: {
				banned: input.locked,
				banReason: input.locked ? reason : null,
				banExpires: null,
			},
		});

		if (input.locked) {
			// Counted after the write, so it accounts for our own change.
			const activeAdmins = await tx.user.count({
				where: { role: "admin", NOT: { banned: true } },
			});
			if (activeAdmins === 0) {
				throw new UserError(409, "No puedes bloquear al último administrador activo.");
			}
			// Cut off open sessions rather than waiting for them to expire.
			await tx.session.deleteMany({ where: { userId: target.id } });
		}

		await recordAudit(tx, {
			action: input.locked ? "user.ban" : "user.unban",
			actor,
			entityId: target.id,
			entityLabel: target.email,
			summary: input.locked
				? `${target.email} bloqueado${reason ? `: ${reason}` : ""}`
				: `${target.email} desbloqueado`,
			before: { banned: Boolean(target.banned) },
			after: { banned: input.locked, ...(input.locked && reason ? { reason } : {}) },
		});

		return {
			user: { id: target.id, name: target.name, email: target.email, locked: input.locked, reason },
		};
	});
}

/**
 * The suspension notice for a locked account, or null if it is not locked.
 *
 * Only ever call this AFTER better-auth has returned BANNED_USER. That error is thrown on
 * session create, which happens after the password is verified — so by then the caller has
 * already proven they own the account, and telling them why they are locked out reveals
 * nothing that account enumeration could exploit.
 */
export async function lockoutNotice(email: string) {
	const user = await prisma.user.findUnique({
		where: { email: email.trim().toLowerCase() },
		select: { banned: true, banReason: true },
	});
	if (!user?.banned) return null;
	return { reason: user.banReason };
}

/**
 * Recent role changes, newest first — a filtered view of the one audit trail rather than
 * a second table. `/panel/auditoria` is the full, queryable version.
 */
export async function listRoleChanges(limit = 15) {
	const { logs } = await queryAuditLogs({ action: "user.role_change", perPage: limit, page: 1 });
	return logs;
}

/**
 * Promote or demote an existing user, on behalf of an actor.
 *
 * The one entry point for role changes — PATCH /api/users/:id and the /panel form action
 * both call it, so the guards below cannot drift apart.
 *
 * Three things are enforced here rather than in the caller:
 *  1. `user:set-role` (Admin only).
 *  2. No self-demotion. An Admin cannot change their own role at all, which removes the
 *     single most likely way to lock yourself out by accident.
 *  3. Never zero Admins. Checked inside the transaction, after the write, with the admin
 *     rows locked — see the comment below for why the obvious version is not enough.
 */
export async function changeUserRole(input: { actor: Actor; userId: unknown; role: unknown }) {
	const { actor } = input;

	if (!can(actor.role, "user:set-role")) {
		throw new UserError(403, "Sin permiso: user:set-role");
	}
	if (typeof input.userId !== "string" || !input.userId) {
		throw new UserError(400, "Se requiere `userId`");
	}
	if (typeof input.role !== "string" || !isRole(input.role)) {
		throw new UserError(400, `Rol desconocido: ${String(input.role)}`);
	}
	if (input.userId === actor.id) {
		throw new UserError(403, "No puedes cambiar tu propio rol. Pídeselo a otro administrador.");
	}

	const role: Role = input.role;

	return prisma.$transaction(async (tx) => {
		// Lock every admin row for the duration. Without this, two admins demoting two
		// different admins at the same time would each still see the other as an admin and
		// both commit, leaving zero. Read-committed does not catch that on its own.
		await tx.$queryRaw`SELECT id FROM "user" WHERE role = 'admin' FOR UPDATE`;

		const target = await tx.user.findUnique({
			where: { id: input.userId as string },
			select: { id: true, name: true, email: true, role: true },
		});
		if (!target) throw new UserError(404, "Usuario no encontrado");
		if (target.role === role) {
			throw new UserError(409, `${target.name} ya tiene el rol ${ROLE_LABEL[role]}`);
		}

		const updated = await tx.user.update({
			where: { id: target.id },
			data: { role },
			select: { id: true, name: true, email: true, role: true },
		});

		// Counted after the write, so it reflects our own change too.
		const admins = await tx.user.count({ where: { role: "admin" } });
		if (admins === 0) {
			throw new UserError(409, "No puedes quitar al último administrador del sistema.");
		}

		// Inside the transaction: the change and its audit entry commit together or not at all.
		await recordAudit(tx, {
			action: "user.role_change",
			actor,
			entityId: target.id,
			entityLabel: target.email,
			summary: `${target.email}: ${target.role ? (ROLE_LABEL[target.role as Role] ?? target.role) : "Sin rol"} → ${ROLE_LABEL[role]}`,
			before: { role: target.role },
			after: { role },
		});

		return {
			user: {
				id: updated.id,
				name: updated.name,
				email: updated.email,
				role: updated.role,
				roleLabel: ROLE_LABEL[role],
			},
			fromRole: target.role,
		};
	});
}

/**
 * Step into another user's session. better-auth's admin plugin does the actual session swap
 * (`auth.api.impersonateUser` stashes the admin's own session in a signed cookie and issues the
 * target's) — this wraps it with the app's own permission registry and an audit entry, the same
 * pair of things `setUserLockout`/`changeUserRole` add on top of a raw better-auth/DB write.
 *
 * A banned target is rejected here rather than left to bounce off `requireUser` on the very next
 * request the impersonated session makes — that would look like the click did nothing.
 * An admin target is rejected by better-auth itself (no `allowImpersonatingAdmins`, see
 * `createAuth`); the UI additionally never renders the button for one.
 */
export async function impersonateUser(input: { actor: Actor; targetUserId: unknown; headers: Headers }) {
	const { actor } = input;

	if (!can(actor.role, "user:impersonate")) {
		throw new UserError(403, "Sin permiso: user:impersonate");
	}
	if (typeof input.targetUserId !== "string" || !input.targetUserId) {
		throw new UserError(400, "Se requiere `targetUserId`");
	}
	if (input.targetUserId === actor.id) {
		throw new UserError(403, "No puedes impersonarte a ti mismo.");
	}

	const target = await prisma.user.findUnique({
		where: { id: input.targetUserId },
		select: { id: true, name: true, email: true, banned: true },
	});
	if (!target) throw new UserError(404, "Usuario no encontrado");
	if (target.banned) throw new UserError(409, "No puedes entrar como un usuario bloqueado.");

	await auth.api.impersonateUser({ body: { userId: target.id }, headers: input.headers });

	await recordAudit(prisma, {
		action: "user.impersonate_start",
		actor,
		entityId: target.id,
		entityLabel: target.email,
		summary: `${actor.email} entró como ${target.email}`,
	});
}

/**
 * End an impersonation and restore the admin's own session.
 *
 * No `can()` check: while impersonating, `locals.user.role` IS the target's role, which may hold
 * no permissions at all — the app's registry has nothing to say about who may click "salir". The
 * real gate is the caller checking `locals.session.impersonatedBy` is actually set before calling
 * this; `auth.api.stopImpersonating` itself refuses with no active impersonation as a backstop.
 */
export async function stopImpersonating(input: { locals: App.Locals; headers: Headers }) {
	const adminId = input.locals.session?.impersonatedBy;
	const target = input.locals.user;
	if (!adminId || !target) throw new UserError(400, "No hay una impersonación activa.");

	const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { id: true, email: true } });
	if (!admin) throw new UserError(404, "Usuario administrador no encontrado");

	await auth.api.stopImpersonating({ headers: input.headers });

	await recordAudit(prisma, {
		action: "user.impersonate_stop",
		actor: { id: admin.id, email: admin.email },
		entityId: target.id,
		entityLabel: target.email,
		summary: `${admin.email} dejó de ser ${target.email}`,
	});
}
