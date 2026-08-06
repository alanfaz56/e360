/**
 * Roles and the permission registry.
 *
 * This file is the single source of truth for "who may do what". Every new feature
 * adds its permission key here with an explicit role list — see CLAUDE.md.
 * Safe to import from both server and browser: it is data + pure functions, no I/O.
 */

import {
	CONTACTO_ROLE_KEYS,
	esRolDeAutoridad,
	isContactoRole,
	type ContactoRole,
} from "./contacto-roles";

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
	// One person's profile and their numbers over a period. Separate from `user:list` because
	// reading how somebody is performing is a different thing from seeing who has an account.
	"user:stats": ["admin", "gerente"],
	"user:set-role": ["admin"],
	"user:ban": ["admin"],
	// The audit trail is Admin-only on purpose: it is the record that holds everyone,
	// including Gerentes, accountable. Do not widen it without being asked.
	"audit:read": ["admin"],
	"cliente:read": ["admin", "gerente", "operador"],
	"cliente:create": ["admin", "gerente", "operador"],
	"cliente:update": ["admin", "gerente", "operador"],
	"cliente:archive": ["admin"],
	"cliente:delete": ["admin"],
	// Creating and editing contacts. Granting a role that carries authority over the
	// customer's property needs `contacto:grant-authority` on top — see canAssignContactoRole.
	"contacto:manage": ["admin", "gerente", "operador"],
	"contacto:grant-authority": ["admin", "gerente"],
	"unidad:read": ["admin", "gerente", "operador"],
	"unidad:create": ["admin", "gerente", "operador"],
	"unidad:update": ["admin", "gerente", "operador"],
	"unidad:archive": ["admin"],
	"unidad:delete": ["admin"],
	// Moving a vehicle between customers is rare and moves an asset. Admin only, motivo
	// required — enforced in transferUnidad.
	"unidad:transfer": ["admin"],
	// Agenda. The whole counter reads and books; only Admin/Gerente reshape an existing
	// appointment. There is deliberately NO permission for the public booking form — it is
	// anonymous by design and gated by Turnstile, not by this registry.
	"cita:read": ["admin", "gerente", "operador"],
	"cita:create": ["admin", "gerente", "operador"],
	"cita:update": ["admin", "gerente"],
	"cita:cancel": ["admin", "gerente"],
	"cita:assign": ["admin", "gerente"],
	// Moving an appointment forward through its estados. Narrower than it looks: an Operador
	// holds it only for appointments assigned to them, and only forward — see `avanzarCita`.
	"cita:advance": ["admin", "gerente", "operador"],

	// --- Notas de servicio -------------------------------------------------------------------
	// The Operador receives the vehicle, inspects it and routes the job. Closing and cancelling
	// stay with Admin/Gerente, the same split as cita:cancel.
	"nota:read": ["admin", "gerente", "operador"],
	"nota:create": ["admin", "gerente", "operador"],
	"nota:inspect": ["admin", "gerente", "operador"],
	"nota:advance": ["admin", "gerente", "operador"],
	"nota:transfer": ["admin", "gerente", "operador"],
	"nota:comment": ["admin", "gerente", "operador"],
	"nota:close": ["admin", "gerente"],
	"nota:cancel": ["admin", "gerente"],

	// Partner workshops Estación 360 sources jobs for. The `taller` ROLE still holds nothing —
	// onboarding those shops as users is its own change, with its own permission decisions.
	"taller:read": ["admin", "gerente", "operador"],
	"taller:manage": ["admin", "gerente"],
	// Reading and deciding the applications that arrive from the public /talleres form.
	// Deliberately NOT `taller:read`: an Operador picks from the approved registry, but who gets
	// certified as a partner is a commercial decision, and the application carries the shop's RFC
	// and the private notes written while deciding.
	"taller:review": ["admin", "gerente"],

	// --- Notificaciones ------------------------------------------------------------------------
	// Reading YOUR OWN inbox, marking it read and managing your own devices needs no key: it is
	// inherent to having an account, so it goes through `requireUser`, not `requirePermission`.
	// That is also what keeps `permissionsFor('taller')` empty — see check-roles.ts.
	// This key is only for pushing a message AT somebody else, by hand or as a broadcast.
	"notificacion:send": ["admin", "gerente"],

	// --- Dinero ------------------------------------------------------------------------------
	// Operador drafts and records the customer's answer; pricing decisions and anything that
	// creates a receivable stay with Admin/Gerente.
	"cotizacion:read": ["admin", "gerente", "operador"],
	"cotizacion:create": ["admin", "gerente", "operador"],
	"cotizacion:send": ["admin", "gerente"],
	"cotizacion:authorize": ["admin", "gerente", "operador"],
	"factura:read": ["admin", "gerente", "operador"],
	"factura:create": ["admin", "gerente"],
	"factura:cancel": ["admin", "gerente"],
	"pago:read": ["admin", "gerente", "operador"],
	"pago:register": ["admin", "gerente", "operador"],
	// Credit terms and the limit itself. Also what lets somebody override an over-limit sale,
	// which is always recorded with a reason — see `asegurarCredito`.
	"cliente:credito": ["admin", "gerente"],
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

/**
 * May `actor` assign this contact role?
 *
 * Two tiers, same spirit as `canAssignRole` above: holding `contacto:manage` lets you
 * create and edit contacts, but roles flagged `autoridad` — the ones that let someone drive
 * a customer's vehicle off the lot or approve spending — additionally need
 * `contacto:grant-authority`. A front-desk Operador should never be the only person
 * involved in making someone able to collect a car.
 */
export function canAssignContactoRole(actor: string | null | undefined, role: string): boolean {
	if (!can(actor, "contacto:manage")) return false;
	if (!isContactoRole(role)) return false;
	return esRolDeAutoridad(role) ? can(actor, "contacto:grant-authority") : true;
}

/** Contact roles `actor` may hand out, for populating the picker. */
export function assignableContactoRoles(actor: string | null | undefined): ContactoRole[] {
	return CONTACTO_ROLE_KEYS.filter((role) => canAssignContactoRole(actor, role));
}

/** Every permission a role holds. Handy for `/api/me` so clients can hide dead UI. */
export function permissionsFor(role: string | null | undefined): Permission[] {
	if (!isRole(role)) return [];
	return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}
