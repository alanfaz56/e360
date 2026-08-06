import { error } from "@sveltejs/kit";
import { can, isRole, type Permission, type Role } from "$lib/roles";

/**
 * `tallerId` is the partner workshop a mechanic works FOR, and it is null for everybody else.
 *
 * It rides on the actor rather than being fetched where it is needed, because it decides SCOPE:
 * which notes somebody can open at all. A scope that has to be re-fetched is a scope somebody
 * eventually forgets to fetch.
 */
export type Actor = { id: string; email: string; name: string; role: Role; tallerId: string | null };

/**
 * The only sanctioned way to read the caller in a server route.
 *
 * Never read `locals.user.role` directly in a route — go through here, so the
 * unauthenticated / banned / role-less cases stay handled in exactly one place.
 */
export function requireUser(locals: App.Locals): Actor {
	const user = locals.user;
	if (!user) error(401, "No autenticado");
	if (user.banned) error(403, "Cuenta suspendida");
	if (!isRole(user.role)) error(403, "Usuario sin rol asignado");
	// Only ever meaningful for a `taller` role — a CHECK constraint guarantees the column agrees,
	// but reading it defensively here means a stale session cannot widen anybody's scope.
	const tallerId = user.role === "taller" ? (user.tallerId ?? null) : null;
	return { id: user.id, email: user.email, name: user.name, role: user.role, tallerId };
}

/** Same, plus a permission check from the src/lib/roles.ts registry. */
export function requirePermission(locals: App.Locals, permission: Permission): Actor {
	const actor = requireUser(locals);
	if (!can(actor.role, permission)) error(403, `Sin permiso: ${permission}`);
	return actor;
}
