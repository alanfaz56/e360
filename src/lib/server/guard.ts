import { error } from "@sveltejs/kit";
import { can, isRole, type Permission, type Role } from "$lib/roles";

export type Actor = { id: string; email: string; name: string; role: Role };

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
	return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Same, plus a permission check from the src/lib/roles.ts registry. */
export function requirePermission(locals: App.Locals, permission: Permission): Actor {
	const actor = requireUser(locals);
	if (!can(actor.role, permission)) error(403, `Sin permiso: ${permission}`);
	return actor;
}
