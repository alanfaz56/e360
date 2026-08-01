import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";
import { InviteError, publicInvitation, revokeInvitation } from "$lib/server/invitations";

/**
 * DELETE /api/invitations/:id — revoke a pending invitation.
 * Permission: `invitation:revoke`. Accepted invitations are kept as an audit trail rather
 * than deleted, so revoking one is refused with 409.
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const actor = requirePermission(locals, "invitation:revoke");

	try {
		const invitation = await revokeInvitation({ actor, id: params.id });
		return json({ invitation: publicInvitation(invitation) });
	} catch (err) {
		if (err instanceof InviteError) error(err.status, err.message);
		throw err;
	}
};
