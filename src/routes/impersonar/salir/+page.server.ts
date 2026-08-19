import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { stopImpersonating } from "$lib/server/users";

/**
 * Mirrors `/logout`: a real <form method="POST"> so the banner's button works with JS off.
 * GET just bounces — nobody stops an impersonation with an <img src>.
 */
export const load: ServerLoad = async () => redirect(303, "/panel");

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (locals.session?.impersonatedBy) {
			await stopImpersonating({ locals, headers: request.headers }).catch(() => {});
		}
		redirect(303, "/panel/usuarios");
	},
};
