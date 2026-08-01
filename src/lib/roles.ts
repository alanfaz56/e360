/**
 * Roles and the permission registry.
 *
 * This file is the single source of truth for "who may do what". Every new feature
 * adds its permission key here with an explicit role list — see CLAUDE.md.
 * Safe to import from both server and browser: it is data + pure functions, no I/O.
 */

export const ROLES = ["admin", "gerente", "operador", "taller"] as const;

export type Role = (typeof ROLES)[number];

/** Display names for the UI. */
export const ROLE_LABEL: Record<Role, string> = {
	admin: "Admin",
	gerente: "Gerente",
	operador: "Operador",
	taller: "Taller Mecánico",
};

/**
 * Authority ladder. Lower number = more authority.
 * Used only for `canAssignRole` — permissions themselves are explicit, never inherited
 * by rank, so a low rank never silently grants a permission nobody listed.
 */
export const ROLE_RANK: Record<Role, number> = {
	admin: 1,
	gerente: 2,
	operador: 3,
	taller: 4,
};

/**
 * The permission registry.
 *
 * Key format: `<resource>:<action>`. The value is the exhaustive list of roles that
 * hold it. A permission missing from this map is denied for everyone — deny by default.
 *
 * ADDING A FEATURE? Add its permission key here first, with the roles confirmed by the
 * product owner. Do not invent the role list.
 */
export const PERMISSIONS = {
	"invitation:create": ["admin", "gerente"],
	"invitation:list": ["admin", "gerente"],
	// Revoking your OWN pending invitation. Revoking someone else's additionally requires
	// `invitation:revoke-any`, so a Gerente cannot cancel a colleague's invite.
	"invitation:revoke": ["admin", "gerente"],
	"invitation:revoke-any": ["admin"],
	"user:list": ["admin", "gerente"],
	"user:set-role": ["admin"],
	"user:ban": ["admin"],
	// The audit trail is Admin-only on purpose: it is the record that holds everyone,
	// including Gerentes, accountable. Do not widen it without being asked.
	"audit:read": ["admin"],
	"cliente:read": ["admin", "gerente", "operador"],
	"cliente:create": ["admin", "gerente", "operador"],
	"cliente:update": ["admin", "gerente", "operador"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function isRole(value: unknown): value is Role {
	return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Deny by default: an unknown role or an unregistered permission is always false. */
export function can(role: string | null | undefined, permission: Permission): boolean {
	if (!isRole(role)) return false;
	const allowed = PERMISSIONS[permission] as readonly Role[] | undefined;
	return allowed?.includes(role) ?? false;
}

/**
 * May `actor` hand out `target`?
 *
 * Strictly-below rule: an inviter can only assign a role with less authority than their
 * own. A Gerente can create Operador and Taller, never another Gerente and never an
 * Admin. This is what stops an inviter from escalating past themselves, so it is
 * enforced server-side on every invitation — never trusted from the client.
 */
export function canAssignRole(actor: string | null | undefined, target: string): boolean {
	if (!isRole(actor) || !isRole(target)) return false;
	return ROLE_RANK[actor] < ROLE_RANK[target];
}

/**
 * Roles `actor` may set on an EXISTING user. Deliberately not `canAssignRole`.
 *
 * Invitations are capped by the strictly-below ladder so an inviter cannot mint a peer or
 * a superior. Re-ranking an existing account is a separate, Admin-only power that escapes
 * that cap — otherwise a second Admin could only ever come from re-running the seed.
 *
 * The lockout guards (no self-demotion, never remove the last Admin) live in
 * `changeUserRole`, because they need to read the database.
 */
export function settableRoles(actor: string | null | undefined): Role[] {
	return can(actor, "user:set-role") ? [...ROLES] : [];
}

/** Roles `actor` is allowed to pick from, for populating a <select>. */
export function assignableRoles(actor: string | null | undefined): Role[] {
	return ROLES.filter((r) => canAssignRole(actor, r));
}

/** Every permission a role holds. Handy for `/api/me` so clients can hide dead UI. */
export function permissionsFor(role: string | null | undefined): Permission[] {
	if (!isRole(role)) return [];
	return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}
