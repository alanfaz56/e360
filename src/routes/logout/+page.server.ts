import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { auth } from "$lib/auth";

/**
 * A route rather than a JS click handler, so the sidebar's Salir button is a real
 * <form method="POST"> that works with JavaScript disabled. GET just bounces to /login,
 * so nobody can log you out with an <img src="/logout">.
 */
export const load: ServerLoad = async () => redirect(303, "/login");

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		await auth.api.signOut({ headers: request.headers }).catch(() => {});
		// Belt and braces: better-auth clears its own cookie, this catches any stragglers.
		for (const { name } of cookies.getAll()) {
			if (name.includes("session")) cookies.delete(name, { path: "/" });
		}
		redirect(303, "/login");
	},
};
