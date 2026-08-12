/**
 * Roles and the permission registry.
 *
 * This file is the single source of truth for "who may do what". Every new feature
 * adds its permission key here with an explicit role list — see CLAUDE.md.
 * Safe to import from both server and browser: it is data + pure functions, no I/O.
 */

import { CONTACTO_ROLE_KEYS, esRolDeAutoridad, isContactoRole, type ContactoRole } from "./contacto-roles";

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
 * The permission registry — DEFAULTS, not necessarily what's live.
 *
 * Key format: `<resource>:<action>`. The value is the exhaustive DEFAULT list of roles that
 * hold it — what a fresh install seeds `permiso_rol` with, and what `can()` falls back to for
 * any key the database cache does not (yet) have an answer for. A permission missing from this
 * map cannot exist at all — deny by default, and there is nothing to seed or to edit for it.
 *
 * ADDING A FEATURE? Add its permission key here first, with the roles confirmed by the product
 * owner (CLAUDE.md Rule 1 — that step does not go away). From then on the LIVE answer for who
 * holds it lives in the database and is editable at /panel/permisos; this object is only ever
 * consulted again as the fallback for a brand-new key nobody has touched yet, or if the database
 * is unreachable. Never read this object directly to answer "does X hold Y" — call `can()`.
 */
export const PERMISOS_DEFAULT = {
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
	// Combines two customers into one, repointing everything the duplicate owned. Comparable
	// or greater blast radius than unidad:transfer and cliente:delete — Admin only, motivo
	// required — enforced in mergeClientes.
	"cliente:merge": ["admin"],
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
	// Combines two duplicate vehicle records into one. Admin only, motivo required — enforced
	// in mergeUnidades.
	"unidad:merge": ["admin"],
	// Manual follow-ups on a vehicle — create, list, mark done. One key covers all three, same
	// granularity as contacto:manage.
	"recordatorio:manage": ["admin", "gerente", "operador"],
	// Home's "últimos movimientos" feed — a live read of citas/notas/pagos, not the audit trail
	// (audit:read stays Admin-only, on purpose). Admin/Gerente only: this is a shop-wide view of
	// everyone's work, not "what do I have to do today".
	"movimientos:read": ["admin", "gerente"],
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
	// The Operador receives the vehicle, inspects it, routes the job and hands the keys back over.
	// Cancelling alone stays Admin/Gerente, the same split as cita:cancel.
	"nota:read": ["admin", "gerente", "operador"],
	"nota:create": ["admin", "gerente", "operador"],
	"nota:inspect": ["admin", "gerente", "operador"],
	"nota:advance": ["admin", "gerente", "operador"],
	"nota:transfer": ["admin", "gerente", "operador"],
	// A mechanic holds this too, but `comentarNota` FORCES `interno: true` for them: notes to the
	// customer are written by whoever owns the relationship with that customer.
	"nota:comment": ["admin", "gerente", "operador", "taller"],
	// The Operador at the counter is who actually hands the keys over — narrowing this to
	// Admin/Gerente meant the front desk had to flag down a manager for every pickup.
	"nota:close": ["admin", "gerente", "operador"],
	"nota:cancel": ["admin", "gerente"],
	"nota:liberacion": ["admin", "gerente", "operador"],

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

	// --- Catálogo e inventario -----------------------------------------------------------------
	// The counter quotes from the catalogue but does not set prices — the same split as
	// `cliente:credito`. `taller` is absent: a mechanic asks for a part by name, and never sees
	// what the shop charges for it.
	"producto:read": ["admin", "gerente", "operador"],
	"producto:manage": ["admin", "gerente"],
	// The cost basis behind precioVenta — margin is Admin-only, narrower than producto:manage.
	// Gerente can still price a product; it just cannot see what that price is worth.
	"producto:costo": ["admin"],
	"inventario:read": ["admin", "gerente", "operador"],
	// Receiving goods and correcting stock both move money; issuing a part to a job is daily work.
	"inventario:entrada": ["admin", "gerente"],
	"inventario:salida": ["admin", "gerente", "operador"],
	// Always requires a motivo — enforced in `ajustarExistencia` and by a CHECK constraint.
	"inventario:ajuste": ["admin", "gerente"],
	// Asking for a part is not taking one. This is the mechanic's only write into inventory, and
	// it produces a request somebody at the counter fills or turns down.
	"inventario:solicitar": ["admin", "gerente", "operador", "taller"],

	// Moving a quote along the SHOP's track (en_proceso → completada → por_cobrar). Separate from
	// `cotizacion:send`, which is about what the customer has been told.
	"cotizacion:interno": ["admin", "gerente", "operador"],

	// --- Taller Mecánico -----------------------------------------------------------------------
	// The first permissions this role has ever held. Scope is the point: a mechanic sees the notes
	// assigned to THEM, and nothing else — `nota:read` (the whole floor) is still not theirs.
	"nota:asignadas": ["admin", "gerente", "operador", "taller"],
	"nota:asignar-mecanico": ["admin", "gerente", "operador"],
	// Write the diagnosis and mark their own work finished. Advancing the NOTE stays with the
	// counter: "the work is done" and "the car can be handed over" are different facts.
	"nota:diagnostico": ["admin", "gerente", "operador", "taller"],
	// Photographing the job. Split from `nota:inspect` (the intake walk-around) so a mechanic can
	// document their work without being able to rewrite how the vehicle arrived.
	"nota:evidencia": ["admin", "gerente", "operador", "taller"],

	// --- Dinero ------------------------------------------------------------------------------
	// Operador quotes and talks to the customer; anything that creates a RECEIVABLE — an invoice,
	// a credit limit — stays with Admin/Gerente.
	"cotizacion:read": ["admin", "gerente", "operador"],
	"cotizacion:create": ["admin", "gerente", "operador"],
	// The counter is who has the customer on the phone. Holding this back meant a quote sat in
	// borrador until a Gerente was free, which is the shop losing the sale to its own permissions.
	"cotizacion:send": ["admin", "gerente", "operador"],
	"cotizacion:authorize": ["admin", "gerente", "operador"],
	// The computed utilidad (venta - costo aprobado). Admin-only on purpose: Gerente can create
	// and approve the raw cost lines below without seeing the resulting margin figure.
	"cotizacion:costo": ["admin"],

	// A cost ESTIMATE for a job, almost always relayed from a mechanic via WhatsApp — not the
	// mechanic's own submission. `taller` holds none of these three: mechanics still see no price
	// or cost anywhere in the app, same rule as `producto:read` excluding them.
	"cotizacion_interna:read": ["admin", "gerente"],
	"cotizacion_interna:create": ["admin", "gerente"],
	"cotizacion_interna:authorize": ["admin", "gerente"],

	"factura:read": ["admin", "gerente", "operador"],
	"factura:create": ["admin", "gerente"],
	"factura:cancel": ["admin", "gerente"],
	// Stamping at the SAT. Separate from `factura:create` because it is the act that turns an
	// internal receivable into a fiscal document: it is irreversible, it spends a timbre, and
	// undoing it is a cancellation the SAT has to accept. Same two roles today, on purpose — the
	// line that matters is that the counter never reaches it.
	"factura:timbrar": ["admin", "gerente"],
	"pago:read": ["admin", "gerente", "operador"],
	"pago:register": ["admin", "gerente", "operador"],
	// Credit terms and the limit itself. Also what lets somebody override an over-limit sale,
	// which is always recorded with a reason — see `asegurarCredito`.
	"cliente:credito": ["admin", "gerente"],

	// --- Ajustes del sistema -------------------------------------------------------------------
	// App-wide configuration: the PAC's credentials, which environment they point at, and what
	// stamping has cost. Admin in the registry AND on the `OWNER_EMAILS` list — see
	// `esDuenoDelSistema`. Two gates because they answer different questions: the registry says
	// "an Admin may", the list says "which Admin". The shop's own owner will be an Admin one day,
	// and handing them the key that stamps CFDIs in our name is not a decision the ladder makes.
	"ajustes:read": ["admin"],
	"ajustes:manage": ["admin"],

	// Estación 360's own contact info (phone, site). Deliberately NOT gated by `requireDueno` like
	// `ajustes:*` above — a phone number is routine shop info, not a PAC credential, and the shop's
	// own Admin/Gerente must be able to change it without being the system owner.
	"empresa:manage": ["admin", "gerente"],

	// Bank accounts a customer transfers money into. Admin-only, narrower than `empresa:manage`:
	// a wrong phone number is a mistake, a wrong CLABE redirects somebody's payment.
	"cuenta_bancaria:manage": ["admin"],

	// The permission registry itself. Admin cannot be removed from this one specific key — see
	// `actualizarPermisoRol` in server/permisos.ts — or a bad edit would permanently lock
	// everybody, including Admin, out of the one screen that could undo it.
	"permisos:manage": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISOS_DEFAULT;

export const PERMISSION_KEYS = Object.keys(PERMISOS_DEFAULT) as Permission[];

export function isRole(value: unknown): value is Role {
	return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * The LIVE registry, in memory. Starts out identical to `PERMISOS_DEFAULT` (so `can()` answers
 * correctly even before anything has ever loaded the database — fails safe, never fails open),
 * and `actualizarPermisosCache` replaces it wholesale once `server/permisos.ts` has read the
 * `permiso_rol` table. Module-level and mutable on purpose: `can()` below has to stay synchronous
 * — hundreds of call sites read it inside a plain `if`, and turning it into a Promise would make
 * every one of those conditions unconditionally truthy instead of failing to compile. A DB-backed
 * permission system with a sync `can()` has to mean a cache, not an async `can()`.
 */
let permisosVivos: Record<string, readonly Role[]> = PERMISOS_DEFAULT;

/**
 * Replace the live registry. Called only from `server/permisos.ts` after reading the database —
 * never call this with partial data. Any key `PERMISOS_DEFAULT` has that `datos` does not (a
 * permission added in code since the last DB read) falls back to its coded default rather than
 * silently denying everyone, which is what makes a brand-new permission usable immediately.
 */
export function actualizarPermisosCache(datos: Readonly<Partial<Record<Permission, readonly Role[]>>>): void {
	const combinado: Record<string, readonly Role[]> = {};
	for (const clave of PERMISSION_KEYS) combinado[clave] = datos[clave] ?? PERMISOS_DEFAULT[clave];
	permisosVivos = combinado;
}

/** Deny by default: an unknown role or an unregistered permission is always false. */
export function can(role: string | null | undefined, permission: Permission): boolean {
	if (!isRole(role)) return false;
	const allowed = permisosVivos[permission] as readonly Role[] | undefined;
	return allowed?.includes(role) ?? false;
}

/**
 * Every role that currently holds `permission`, from the LIVE registry. Used where the audience
 * is "everyone who holds X" rather than "does this one actor hold X" — `usuariosCon` for a
 * `difusion` notification is the caller. Reading `permisosVivos` directly (never
 * `PERMISOS_DEFAULT`) is what makes an admin's edit apply to who gets paged, not just to who
 * passes a permission check.
 */
export function rolesQueTienen(permission: Permission): readonly Role[] {
	return permisosVivos[permission] ?? [];
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
	return PERMISSION_KEYS.filter((p) => can(role, p));
}
