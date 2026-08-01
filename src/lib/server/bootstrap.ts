/**
 * Prisma + better-auth construction, parameterized on env.
 *
 * Exists because two callers need the exact same configuration from different env
 * sources: the SvelteKit server (`$env/dynamic/private`) and `prisma/seed.ts`, which
 * runs under tsx where `$env` does not resolve at all. Keeping the config here means
 * the seed can never drift from the running app.
 *
 * Relative imports only — no `$lib` alias, so tsx can load this file directly.
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin as adminPlugin } from "better-auth/plugins/admin";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { ROLES } from "../roles.js";

export function createPrisma(databaseUrl: string | undefined) {
	if (!databaseUrl) throw new Error("DATABASE_URL no está definida");
	return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/**
 * Access control for better-auth's OWN admin endpoints (/api/auth/admin/*).
 * Only Admin gets them. Application permissions live in src/lib/roles.ts — this map
 * exists so better-auth rejects unknown role strings, and so a Gerente cannot reach
 * /admin/set-role to promote themselves.
 */
const ac = createAccessControl(defaultStatements);
const authRoles = {
	admin: adminAc,
	gerente: ac.newRole({}),
	operador: ac.newRole({}),
	taller: ac.newRole({}),
} satisfies Record<(typeof ROLES)[number], unknown>;

/**
 * `extraPlugins` exists so the SvelteKit runtime can append `sveltekitCookies`, which
 * needs `$app/server` — unavailable to the seed script. It must stay last in the list.
 */
export function createAuth(
	prisma: PrismaClient,
	env: { BETTER_AUTH_SECRET?: string; BETTER_AUTH_URL?: string },
	extraPlugins: Parameters<typeof betterAuth>[0]["plugins"] = [],
) {
	return betterAuth({
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		database: prismaAdapter(prisma, { provider: "postgresql" }),
		session: {
			// "Recordar sesión 30 días" on the login form maps to better-auth's `rememberMe`.
			// With it ON the cookie gets this maxAge; with it OFF the cookie has no maxAge at
			// all and dies when the browser closes. Either way NOTHING about the password is
			// stored — only the signed session token, exactly as in a normal login.
			expiresIn: 60 * 60 * 24 * 30,
		},
		emailAndPassword: {
			enabled: true,
			// Invitation-only. This kills POST /sign-up/email outright, including server-side
			// calls to auth.api.signUpEmail. Accounts are born exclusively through
			// auth.api.createUser, which src/lib/server/invitations.ts calls after validating
			// an invite token.
			disableSignUp: true,
		},
		plugins: [
			adminPlugin({
				ac,
				roles: authRoles,
				adminRoles: ["admin"],
				// Fallback shown when a locked account signs in with no reason recorded. The
				// login page replaces it with the actual `banReason` when there is one.
				bannedUserMessage:
					"Tu cuenta está suspendida. Contacta a un administrador de Estación 360.",
				// Least privilege if a role is ever somehow omitted at creation.
				defaultRole: "taller",
			}),
			...(extraPlugins ?? []),
		],
	});
}
