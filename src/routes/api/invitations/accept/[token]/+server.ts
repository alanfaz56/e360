import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ROLE_LABEL, type Role } from "$lib/roles";
import { InviteError, acceptInvitation, findLiveInvitation } from "$lib/server/invitations";

/**
 * GET /api/invitations/accept/:token — public. Tells the accept page who the invite is
 * for, without exposing anything the holder of the token doesn't already have.
 */
export const GET: RequestHandler = async ({ params }) => {
	const invitation = await findLiveInvitation(params.token!);
	if (!invitation) error(404, "Invitación inválida, vencida o ya utilizada");

	return json({
		email: invitation.email,
		role: invitation.role,
		roleLabel: ROLE_LABEL[invitation.role as Role] ?? invitation.role,
		expiresAt: invitation.expiresAt.toISOString(),
	});
};

/**
 * POST /api/invitations/accept/:token — public. Redeems the token into an account.
 * Body: { name: string, password: string }
 *
 * `role` and `email` are intentionally NOT read from the body — both come off the
 * stored invitation, so the redeemer cannot pick their own role or claim another inbox.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body.name !== "string" || typeof body.password !== "string") {
		error(400, "Se requieren `name` y `password`");
	}

	try {
		const { user, role } = await acceptInvitation({
			token: params.token!,
			name: body.name,
			password: body.password,
		});
		return json({ user: { id: user.id, email: user.email, name: user.name, role } }, { status: 201 });
	} catch (err) {
		if (err instanceof InviteError) error(err.status, err.message);
		throw err;
	}
};
