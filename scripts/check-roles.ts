/**
 * Self-check for the permission registry. Run: npm test
 *
 * These are the rules a bad edit to src/lib/roles.ts would silently break — deny by
 * default, and the strictly-below ceiling that stops an inviter escalating past
 * themselves. Pure functions, no DB and no server needed.
 */
import assert from "node:assert/strict";
import {
	ROLES,
	can,
	canAssignRole,
	assignableRoles,
	settableRoles,
	permissionsFor,
	isRole,
} from "../src/lib/roles.js";

// Deny by default: unknown roles and unknown permissions grant nothing.
assert.equal(can(null, "invitation:create"), false);
assert.equal(can(undefined, "invitation:create"), false);
assert.equal(can("superadmin", "invitation:create"), false);
assert.equal(can("admin", "orden:cerrar" as never), false, "unregistered permission must be denied");
assert.equal(isRole("root"), false);

// The confirmed invite matrix.
assert.equal(can("admin", "invitation:create"), true);
assert.equal(can("gerente", "invitation:create"), true);
assert.equal(can("operador", "invitation:create"), false);
assert.equal(can("taller", "invitation:create"), false);

// The confirmed Clientes matrix. Taller Mecánico is deliberately excluded.
assert.equal(can("admin", "cliente:read"), true);
assert.equal(can("gerente", "cliente:create"), true);
assert.equal(can("operador", "cliente:update"), true);
assert.equal(can("taller", "cliente:read"), false);

// Rank never leaks permissions sideways: holding cliente:* grants nothing about users,
// and Taller Mecánico still holds nothing at all.
assert.equal(can("operador", "user:list"), false);
assert.deepEqual(permissionsFor("operador"), ["cliente:read", "cliente:create", "cliente:update"]);
assert.deepEqual(permissionsFor("taller"), []);

// Role ceiling: strictly below your own, never at or above it.
for (const role of ROLES) {
	assert.equal(canAssignRole(role, role), false, `${role} must not clone itself`);
	assert.equal(canAssignRole(role, "admin"), false, `${role} must never mint an admin`);
}
assert.deepEqual(assignableRoles("admin"), ["gerente", "operador", "taller"]);
assert.deepEqual(assignableRoles("gerente"), ["operador", "taller"]);
assert.deepEqual(assignableRoles("operador"), ["taller"]);
assert.deepEqual(assignableRoles("taller"), []);
assert.deepEqual(assignableRoles("desconocido"), []);

// Changing an existing user's role is Admin-only and, unlike invitations, is NOT capped by
// the strictly-below ladder — that is the only way a second Admin can ever exist.
assert.equal(can("admin", "user:set-role"), true);
assert.equal(can("gerente", "user:set-role"), false);
assert.equal(can("operador", "user:set-role"), false);
assert.equal(can("taller", "user:set-role"), false);
assert.deepEqual(settableRoles("admin"), ["admin", "gerente", "operador", "taller"]);
assert.deepEqual(settableRoles("gerente"), []);
assert.deepEqual(settableRoles(null), []);
// An Admin can promote to Admin here, but still cannot INVITE one.
assert.equal(settableRoles("admin").includes("admin"), true);
assert.equal(assignableRoles("admin").includes("admin"), false);

// Cancelling your own invitation vs anybody's are separate powers.
assert.equal(can("gerente", "invitation:revoke"), true);
assert.equal(can("gerente", "invitation:revoke-any"), false, "gerente must not cancel others' invites");
assert.equal(can("admin", "invitation:revoke-any"), true);
assert.equal(can("operador", "invitation:revoke"), false);

// Lockout is Admin-only.
assert.equal(can("admin", "user:ban"), true);
for (const role of ROLES.filter((r) => r !== "admin")) {
	assert.equal(can(role, "user:ban"), false, `${role} must not lock users out`);
}

// The audit trail is readable by Admin alone — it is what holds everyone else accountable.
assert.equal(can("admin", "audit:read"), true);
for (const role of ROLES.filter((r) => r !== "admin")) {
	assert.equal(can(role, "audit:read"), false, `${role} must not read the audit trail`);
}

console.log("check-roles: OK");
