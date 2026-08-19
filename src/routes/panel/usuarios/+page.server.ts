import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import { ROLE_LABEL, assignableRoles, can, settableRoles } from "$lib/roles";
import { requirePermission, requireUser } from "$lib/server/guard";
import { canRevokeInvitation, issueInvitation, publicInvitation, revokeInvitation } from "$lib/server/invitations";
import { changeUserRole, impersonateUser, listRoleChanges, listUsers, setUserLockout } from "$lib/server/users";
import { fallo } from "$lib/server/errores";

export const load: ServerLoad = async ({ locals }) => {
	const actor = requirePermission(locals, "user:list");
	const canSetRole = can(actor.role, "user:set-role");

	const invitations = can(actor.role, "invitation:list")
		? await prisma.invitation.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
		: [];

	return {
		actorId: actor.id,
		canLock: can(actor.role, "user:ban"),
		canImpersonate: can(actor.role, "user:impersonate"),
		users: await listUsers(),
		// `canRevoke` is computed server-side per row so the button only appears where the
		// server would actually allow it — same function the action calls.
		invitations: invitations.map((invitation) => ({
			...publicInvitation(invitation),
			canRevoke: canRevokeInvitation(actor, invitation),
		})),
		assignableRoles: assignableRoles(actor.role).map((r) => ({ value: r, label: ROLE_LABEL[r] })),
		settableRoles: settableRoles(actor.role).map((r) => ({ value: r, label: ROLE_LABEL[r] })),
		roleChanges: canSetRole ? await listRoleChanges(15) : [],
	};
};

export const actions: Actions = {
	/** Same authority rules as POST /api/invitations — both call `issueInvitation`. */
	invitar: async ({ locals, request, url }) => {
		const actor = requireUser(locals);
		const form = await request.formData();

		try {
			const { url: link } = await issueInvitation({
				actor,
				email: form.get("email"),
				role: form.get("role"),
				origin: url.origin,
			});
			// Surfaced once. Copy it out now — only the hash survives in the DB.
			return { inviteUrl: link };
		} catch (err) {
			return fallo(err);
		}
	},

	/** Same authority rules as DELETE /api/invitations/:id — both call `revokeInvitation`. */
	revocar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();

		try {
			await revokeInvitation({ actor, id: form.get("id") });
			return { revoked: true };
		} catch (err) {
			return fallo(err);
		}
	},

	/** Same authority rules as PATCH /api/users/:id — both call `changeUserRole`. */
	cambiarRol: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();

		try {
			const { user, fromRole } = await changeUserRole({
				actor,
				userId: form.get("userId"),
				role: form.get("role"),
			});
			return {
				roleChanged: `${user.name}: ${fromRole ? ROLE_LABEL[fromRole as keyof typeof ROLE_LABEL] : "Sin rol"} → ${user.roleLabel}`,
			};
		} catch (err) {
			return fallo(err);
		}
	},

	/** Same authority rules as PATCH /api/users/:id — both call `setUserLockout`. */
	bloquear: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();

		try {
			const { user } = await setUserLockout({
				actor,
				userId: form.get("userId"),
				locked: form.get("locked") === "true",
				reason: form.get("reason"),
			});
			return {
				lockChanged: user.locked
					? `${user.email} quedó bloqueado y sus sesiones se cerraron.`
					: `${user.email} puede volver a entrar.`,
			};
		} catch (err) {
			return fallo(err);
		}
	},

	/** Hands the browser the target's session — redirect, not a form return, on success. */
	impersonar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();

		try {
			await impersonateUser({ actor, targetUserId: form.get("userId"), headers: request.headers });
		} catch (err) {
			return fallo(err);
		}
		redirect(303, "/panel");
	},
};
