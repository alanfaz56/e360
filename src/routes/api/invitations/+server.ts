import { error, json, type RequestHandler } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import { requirePermission, requireUser } from "$lib/server/guard";
import { InviteError, issueInvitation, publicInvitation } from "$lib/server/invitations";

/** GET /api/invitations — list invitations. Permission: `invitation:list`. */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "invitation:list");

	const onlyPending = url.searchParams.get("estado") === "pendiente";
	const invitations = await prisma.invitation.findMany({
		where: onlyPending ? { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } : undefined,
		orderBy: { createdAt: "desc" },
		take: 200,
	});

	return json({ invitations: invitations.map(publicInvitation) });
};

/**
 * POST /api/invitations — issue an invitation.
 * Body: { email: string, role: "gerente" | "operador" | "taller" }
 *
 * Authority (permission + role ceiling) is decided inside `issueInvitation`, shared
 * with the /panel form action. Returns the one-time URL — shown here and never again,
 * because the DB only keeps its hash.
 */
export const POST: RequestHandler = async ({ locals, request, url }) => {
	const actor = requireUser(locals);
	const body = await request.json().catch(() => null);

	try {
		const {
			invitation,
			url: link,
			delivery,
		} = await issueInvitation({
			actor,
			email: body?.email,
			role: body?.role,
			origin: url.origin,
		});
		return json({ invitation: publicInvitation(invitation), url: link, delivery }, { status: 201 });
	} catch (err) {
		if (err instanceof InviteError) error(err.status, err.message);
		throw err;
	}
};
