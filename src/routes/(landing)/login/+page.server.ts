import { fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { auth } from "$lib/auth";
import { lockoutNotice } from "$lib/server/users";
import { getPostHogClient } from "$lib/server/posthog";

export const load: ServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, url.searchParams.get("next") ?? "/panel");
	return {};
};

/**
 * better-auth throws BANNED_USER from the session-create hook, which runs only after the
 * password has been verified. So this error proves the caller owns the account, and the
 * suspension reason can be shown without leaking whether an address exists.
 */
function isBannedError(error: unknown): boolean {
	const body = (error as { body?: { code?: string } })?.body;
	return body?.code === "BANNED_USER";
}

export const actions: Actions = {
	default: async ({ request, url }) => {
		const form = await request.formData();
		const email = String(form.get("email") ?? "")
			.trim()
			.toLowerCase();
		const password = String(form.get("password") ?? "");

		// Checkbox: present means checked. Only affects how long the session cookie lives —
		// the password itself is never stored anywhere on the device.
		const remember = form.get("remember") !== null;

		// Every failure branch returns the same shape, so the page gets one union to render.
		const problem = (status: number, message: string, extra?: { locked: true; reason: string | null }) =>
			fail(status, {
				email,
				remember,
				message,
				locked: extra?.locked ?? false,
				reason: extra?.reason ?? null,
			});

		if (!email || !password) {
			return problem(400, "Correo y contraseña son obligatorios.");
		}

		let signedInUser: { id: string; name: string; role?: string | null } | null = null;
		try {
			// The `sveltekitCookies` plugin writes the session cookie for us. `rememberMe: false`
			// makes it a browser-session cookie with no maxAge, so it dies when the browser does.
			const result = await auth.api.signInEmail({
				body: { email, password, rememberMe: remember },
				headers: request.headers,
			});
			signedInUser = result?.user ?? null;
		} catch (error) {
			if (isBannedError(error)) {
				const notice = await lockoutNotice(email);
				return problem(403, "Tu cuenta está suspendida.", {
					locked: true,
					reason: notice?.reason ?? null,
				});
			}
			// Deliberately vague: never reveal whether the address exists.
			return problem(401, "Correo o contraseña incorrectos.");
		}

		// Track the sign-in server-side. PII (email, name) stays in person properties via
		// identify; event properties only carry the stable user id and session metadata.
		if (signedInUser) {
			const posthog = getPostHogClient();
			posthog.identify({
				distinctId: signedInUser.id,
				properties: { name: signedInUser.name },
			});
			posthog.capture({
				distinctId: signedInUser.id,
				event: "user_signed_in",
				properties: { remember_me: remember },
			});
			await posthog.flush();
		}

		redirect(303, url.searchParams.get("next") ?? "/panel");
	},
};
