import { createHash, randomBytes, randomUUID } from "node:crypto";
import prisma from "$lib/prisma";
import { auth } from "$lib/auth";
import { ROLE_LABEL, assignableRoles, can, canAssignRole, isRole, type Role } from "$lib/roles";
import { recordAudit } from "./audit";
import { enviarInvitacion } from "./correo/index";
import type { Actor } from "./guard";

export const INVITE_TTL_HOURS = 72;
export const MIN_PASSWORD_LENGTH = 8;

/** Thrown for anything the caller did wrong; routes map `.status` straight to HTTP. */
export class InviteError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * The raw token is shown once and never stored. Only its SHA-256 lands in the DB, so
 * read access to the `invitation` table does not let anyone redeem an invite.
 * SHA-256 with no salt is correct here (unlike for passwords): the token is 256 bits
 * of entropy, so there is nothing to brute-force.
 */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const invitePath = (token: string) => `/invitacion/${token}`;

export const inviteUrl = (token: string, origin: string) =>
	new URL(invitePath(token), origin).toString();

/**
 * Sends the invite link by email via Resend. The API still hands the raw URL back to the
 * inviter regardless of whether this succeeds — WhatsApp-by-hand stays available as a fallback
 * (or the only channel, if Resend is not configured), so nothing here can strand an invitation.
 */
export async function deliverInvitation(
	email: string,
	url: string,
	inviterName: string,
	role: Role,
): Promise<{ delivered: boolean; channel: "resend" | "manual" }> {
	const enviado = await enviarInvitacion({
		email,
		invitadorNombre: inviterName,
		rolLabel: ROLE_LABEL[role],
		url,
	});
	return enviado ? { delivered: true, channel: "resend" } : { delivered: false, channel: "manual" };
}

/**
 * Issue an invitation. Caller MUST have already checked `invitation:create` and
 * `canAssignRole(actor.role, role)` — this function does not re-derive authority.
 */
export async function createInvitation(input: {
	email: string;
	role: Role;
	invitedById: string;
}) {
	const email = normalizeEmail(input.email);
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
		throw new InviteError(400, "Correo inválido");
	}

	if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
		throw new InviteError(409, "Ya existe un usuario con ese correo");
	}

	// One live token per address: re-inviting silently kills the previous link so an
	// old copy floating around in a chat cannot still be redeemed.
	await prisma.invitation.updateMany({
		where: { email, acceptedAt: null, revokedAt: null },
		data: { revokedAt: new Date() },
	});

	const token = randomBytes(32).toString("base64url");
	const invitation = await prisma.invitation.create({
		data: {
			id: randomUUID(),
			email,
			role: input.role,
			tokenHash: hashToken(token),
			invitedById: input.invitedById,
			expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3600_000),
		},
	});

	return { invitation, token };
}

/**
 * Issue an invitation *on behalf of an actor* — the one entry point every caller uses.
 *
 * Both the JSON API and the /panel form action route through here, so the two authority
 * rules (holds `invitation:create`; target role sits strictly below the actor's own)
 * are enforced once and cannot drift apart.
 */
export async function issueInvitation(input: {
	actor: Actor;
	email: unknown;
	role: unknown;
	origin: string;
}) {
	const { actor } = input;

	if (!can(actor.role, "invitation:create")) {
		throw new InviteError(403, "Sin permiso: invitation:create");
	}
	if (typeof input.email !== "string" || typeof input.role !== "string") {
		throw new InviteError(400, "Se requieren `email` y `role`");
	}
	if (!isRole(input.role)) throw new InviteError(400, `Rol desconocido: ${input.role}`);
	if (!canAssignRole(actor.role, input.role)) {
		throw new InviteError(
			403,
			`Como ${ROLE_LABEL[actor.role]} solo puedes invitar: ${assignableRoles(actor.role)
				.map((r) => ROLE_LABEL[r])
				.join(", ")}`,
		);
	}

	const { invitation, token } = await createInvitation({
		email: input.email,
		role: input.role,
		invitedById: actor.id,
	});
	const url = inviteUrl(token, input.origin);
	const delivery = await deliverInvitation(invitation.email, url, actor.name, input.role);

	// Never record the token or the URL — the audit trail must not become a way to redeem
	// an invitation.
	await recordAudit(prisma, {
		action: "invitation.create",
		actor,
		entityId: invitation.id,
		entityLabel: invitation.email,
		summary: `Invitación a ${invitation.email} como ${ROLE_LABEL[input.role]}`,
		after: { email: invitation.email, role: input.role, expiresAt: invitation.expiresAt.toISOString() },
	});

	return { invitation, url, delivery };
}

/**
 * May `actor` revoke this invitation? You can always cancel one you sent yourself;
 * cancelling somebody else's additionally needs `invitation:revoke-any` (Admin).
 * Exported so the UI can hide the button on rows it would reject anyway.
 */
export function canRevokeInvitation(
	actor: Pick<Actor, "id" | "role">,
	invitation: { invitedById: string; acceptedAt: Date | null; revokedAt: Date | null },
) {
	if (invitation.acceptedAt || invitation.revokedAt) return false;
	if (!can(actor.role, "invitation:revoke")) return false;
	return invitation.invitedById === actor.id || can(actor.role, "invitation:revoke-any");
}

/**
 * Revoke a pending invitation — the one entry point, shared by the JSON API and the
 * /panel form action so the ownership rule cannot drift.
 */
export async function revokeInvitation(input: { actor: Actor; id: unknown }) {
	if (typeof input.id !== "string" || !input.id) throw new InviteError(400, "Se requiere `id`");
	if (!can(input.actor.role, "invitation:revoke")) {
		throw new InviteError(403, "Sin permiso: invitation:revoke");
	}

	const invitation = await prisma.invitation.findUnique({ where: { id: input.id } });
	if (!invitation) throw new InviteError(404, "Invitación no encontrada");
	if (invitation.acceptedAt) throw new InviteError(409, "La invitación ya fue aceptada");
	if (invitation.revokedAt) throw new InviteError(409, "La invitación ya estaba revocada");
	if (!canRevokeInvitation(input.actor, invitation)) {
		throw new InviteError(403, "Solo puedes cancelar las invitaciones que tú enviaste.");
	}

	const revoked = await prisma.invitation.update({
		where: { id: invitation.id },
		data: { revokedAt: new Date() },
	});

	await recordAudit(prisma, {
		action: "invitation.revoke",
		actor: input.actor,
		entityId: revoked.id,
		entityLabel: revoked.email,
		summary: `Invitación revocada: ${revoked.email}`,
		before: { revokedAt: null },
		after: { revokedAt: revoked.revokedAt?.toISOString() ?? null },
	});

	return revoked;
}

/** Look up a live invitation by its raw token. Returns null for any unusable state. */
export async function findLiveInvitation(token: string) {
	const invitation = await prisma.invitation.findUnique({
		where: { tokenHash: hashToken(token) },
	});
	if (!invitation) return null;
	if (invitation.acceptedAt || invitation.revokedAt) return null;
	if (invitation.expiresAt <= new Date()) return null;
	return invitation;
}

/**
 * Redeem an invitation into a real user account. This is the ONLY path that creates
 * users besides the seed — `emailAndPassword.disableSignUp` blocks every other one.
 *
 * The role comes off the stored invitation row, never off the request body, so a
 * redeemer cannot upgrade themselves on the way in.
 */
export async function acceptInvitation(input: {
	token: string;
	name: string;
	password: string;
}) {
	const name = input.name.trim();
	if (name.length < 2) throw new InviteError(400, "Nombre requerido");
	if (input.password.length < MIN_PASSWORD_LENGTH) {
		throw new InviteError(400, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
	}

	const invitation = await findLiveInvitation(input.token);
	if (!invitation) throw new InviteError(404, "Invitación inválida, vencida o ya utilizada");

	// Claim the row before creating the user. The WHERE re-checks every liveness
	// condition, so two simultaneous submissions of the same link produce one account:
	// the loser sees count === 0.
	const claimed = await prisma.invitation.updateMany({
		where: {
			id: invitation.id,
			acceptedAt: null,
			revokedAt: null,
			expiresAt: { gt: new Date() },
		},
		data: { acceptedAt: new Date() },
	});
	if (claimed.count === 0) throw new InviteError(409, "Esta invitación ya fue utilizada");

	try {
		// No headers passed => better-auth treats this as a trusted server call and skips
		// its own admin permission check. Authority was already settled at invite time.
		const { user } = await auth.api.createUser({
			body: {
				email: invitation.email,
				name,
				password: input.password,
				// Validated on the way in by `issueInvitation`; the column is a plain VARCHAR.
				role: invitation.role as Role,
			},
		});

		// The new user is their own actor here: nobody else performed this action.
		// Never record the password or the token.
		await recordAudit(prisma, {
			action: "invitation.accept",
			actor: { id: user.id, email: user.email },
			entityId: invitation.id,
			entityLabel: invitation.email,
			summary: `${invitation.email} activó su cuenta como ${ROLE_LABEL[invitation.role as Role] ?? invitation.role}`,
			after: { userId: user.id, role: invitation.role },
		});

		return { user, role: invitation.role as Role };
	} catch (err) {
		// Put the invitation back so a transient failure does not burn the link.
		await prisma.invitation.update({
			where: { id: invitation.id },
			data: { acceptedAt: null },
		});
		throw err instanceof InviteError
			? err
			: new InviteError(500, "No se pudo crear la cuenta");
	}
}

/** Shape returned by the API. Never leaks tokenHash. */
export const publicInvitation = (i: {
	id: string;
	email: string;
	role: string;
	invitedById: string;
	expiresAt: Date;
	createdAt: Date;
	acceptedAt: Date | null;
	revokedAt: Date | null;
}) => ({
	id: i.id,
	email: i.email,
	role: i.role,
	invitedById: i.invitedById,
	roleLabel: ROLE_LABEL[i.role as Role] ?? i.role,
	expiresAt: i.expiresAt.toISOString(),
	createdAt: i.createdAt.toISOString(),
	status: i.acceptedAt ? "aceptada" : i.revokedAt ? "revocada" : i.expiresAt <= new Date() ? "vencida" : "pendiente",
});
