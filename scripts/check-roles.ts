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
	canAssignContactoRole,
	assignableRoles,
	assignableContactoRoles,
	settableRoles,
	permissionsFor,
	isRole,
} from "../src/lib/roles.js";
import { esRolDeAutoridad } from "../src/lib/contacto-roles.js";

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

// Archiving, hard-deleting and moving a vehicle between customers are Admin-only. Operador
// does day-to-day create/update but can never make a record vanish or reassign an asset.
for (const key of [
	"cliente:archive",
	"cliente:delete",
	"unidad:archive",
	"unidad:delete",
	"unidad:transfer",
] as const) {
	assert.equal(can("admin", key), true, `admin must hold ${key}`);
	for (const role of ROLES.filter((r) => r !== "admin")) {
		assert.equal(can(role, key), false, `${role} must not hold ${key}`);
	}
}

// Units mirror clientes for read/create/update, and Taller still has nothing.
assert.equal(can("operador", "unidad:create"), true);
assert.equal(can("gerente", "unidad:update"), true);
assert.equal(can("taller", "unidad:read"), false);
assert.deepEqual(permissionsFor("taller"), [], "Taller Mecánico holds nothing until órdenes de servicio");

// --- The two-tier contact rule ---------------------------------------------------------
// Anyone with contacto:manage can add a contact; only Admin/Gerente may hand out a role that
// carries authority over the customer's property.
assert.equal(can("operador", "contacto:manage"), true);
assert.equal(can("operador", "contacto:grant-authority"), false);
assert.equal(can("gerente", "contacto:grant-authority"), true);
assert.equal(can("taller", "contacto:manage"), false);

assert.deepEqual(assignableContactoRoles("operador"), ["facturacion", "general"]);
assert.deepEqual(assignableContactoRoles("gerente"), [
	"entregador",
	"autorizador",
	"facturacion",
	"general",
]);
assert.deepEqual(assignableContactoRoles("admin"), [
	"entregador",
	"autorizador",
	"facturacion",
	"general",
]);
assert.deepEqual(assignableContactoRoles("taller"), []);

assert.equal(canAssignContactoRole("operador", "entregador"), false);
assert.equal(canAssignContactoRole("operador", "autorizador"), false);
assert.equal(canAssignContactoRole("operador", "general"), true);
assert.equal(canAssignContactoRole("gerente", "entregador"), true);
assert.equal(canAssignContactoRole("taller", "general"), false, "no contacto:manage, no contacts");
assert.equal(canAssignContactoRole("admin", "inventado"), false, "unknown role is always denied");

// The flags the rule keys off must not drift.
assert.equal(esRolDeAutoridad("entregador"), true);
assert.equal(esRolDeAutoridad("autorizador"), true);
assert.equal(esRolDeAutoridad("facturacion"), false);
assert.equal(esRolDeAutoridad("general"), false);

// --- Agenda ----------------------------------------------------------------------------------
// The counter books and reads; only Admin/Gerente reshape an existing appointment.
for (const key of ["cita:read", "cita:create", "cita:advance"] as const) {
	for (const role of ["admin", "gerente", "operador"] as const) {
		assert.equal(can(role, key), true, `${role} must hold ${key}`);
	}
	assert.equal(can("taller", key), false, `taller must not hold ${key}`);
}
for (const key of ["cita:update", "cita:cancel", "cita:assign"] as const) {
	assert.equal(can("admin", key), true);
	assert.equal(can("gerente", key), true);
	assert.equal(can("operador", key), false, `operador must not hold ${key}`);
	assert.equal(can("taller", key), false);
}
// An Operador holding cita:advance but NOT cita:update is exactly what makes the
// "only your own assigned appointments" rule in avanzarCita load-bearing. If someone ever
// grants operador cita:update, that ownership check silently stops applying.
assert.equal(can("operador", "cita:advance") && !can("operador", "cita:update"), true);

// There is deliberately no permission for the public booking form — it is anonymous and gated
// by Turnstile. A `cita:solicitar` key appearing here would mean somebody moved that gate.
assert.equal(can("admin", "cita:solicitar" as never), false);

// Reading how a colleague is performing is not the same as seeing that they have an account,
// so it is its own key — and it never widens past the two roles that manage people.
assert.equal(can("admin", "user:stats"), true);
assert.equal(can("gerente", "user:stats"), true);
assert.equal(can("operador", "user:stats"), false);
assert.equal(can("taller", "user:stats"), false);

// Rank never leaks permissions sideways: holding cliente:* grants nothing about users,
// and Taller Mecánico still holds nothing at all.
assert.equal(can("operador", "user:list"), false);
assert.deepEqual(permissionsFor("operador"), [
	"cliente:read",
	"cliente:create",
	"cliente:update",
	"contacto:manage",
	"unidad:read",
	"unidad:create",
	"unidad:update",
	"cita:read",
	"cita:create",
	"cita:advance",
]);
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
