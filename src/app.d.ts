import type { Session, User } from "better-auth";

declare global {
	namespace App {
		interface Locals {
			// `role` is a raw column value at this boundary. Narrow it to a `Role` with
			// `requireUser`/`requirePermission` from $lib/server/guard — never trust it here.
			user: (User & { role?: string | null; banned?: boolean | null; tallerId?: string | null }) | null;
			session: Session | null;
		}

		/** What `handleError` returns and `+error.svelte` renders. `ref` points at the server log. */
		interface Error {
			message: string;
			ref?: string;
		}
	}
}

export {};
