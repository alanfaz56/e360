import { createAuthClient } from "better-auth/svelte";
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
	plugins: [adminClient()],
});

// No `signUp` on purpose: registration is invitation-only. Accounts are created by
// POST /api/invitations/accept/[token].
export const { signIn, signOut, useSession } = authClient;
