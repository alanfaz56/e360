/**
 * Self-check for the permission registry. Run: npm test
 *
 * These are the rules a bad edit to src/lib/roles.ts would silently break — deny by
 * default, and the strictly-below ceiling that stops an inviter escalating past
 * themselves. Pure functions, no DB and no server needed.
 */
import assert from "node:assert/strict";
import {
	PERMISSIONS,
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
import { NOTIFICACION_EVENTOS, NOTIFICACION_EVENTO_KEYS } from "../src/lib/notificaciones.js";

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
	"cliente:merge",
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
// Taller Mecánico now holds a narrow set — see the "Taller Mecánico" block at the end of this
// file for the full list and why each one is in it. Nothing about clientes or unidades is in it.
assert.equal(can("taller", "unidad:read"), false);
assert.equal(can("taller", "cliente:read"), false);

// --- The two-tier contact rule ---------------------------------------------------------
// Anyone with contacto:manage can add a contact; only Admin/Gerente may hand out a role that
// carries authority over the customer's property.
assert.equal(can("operador", "contacto:manage"), true);
assert.equal(can("operador", "contacto:grant-authority"), false);
assert.equal(can("gerente", "contacto:grant-authority"), true);
assert.equal(can("taller", "contacto:manage"), false);

assert.deepEqual(assignableContactoRoles("operador"), ["facturacion", "general"]);
assert.deepEqual(assignableContactoRoles("gerente"), ["entregador", "autorizador", "facturacion", "general"]);
assert.deepEqual(assignableContactoRoles("admin"), ["entregador", "autorizador", "facturacion", "general"]);
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
	"nota:read",
	"nota:create",
	"nota:inspect",
	"nota:advance",
	"nota:transfer",
	"nota:comment",
	"taller:read",
	"producto:read",
	"inventario:read",
	"inventario:salida",
	"inventario:solicitar",
	"cotizacion:interno",
	"nota:asignadas",
	"nota:asignar-mecanico",
	"nota:diagnostico",
	"nota:evidencia",
	"cotizacion:read",
	"cotizacion:create",
	"cotizacion:send",
	"cotizacion:authorize",
	"factura:read",
	"pago:read",
	"pago:register",
]);
assert.equal(can("taller", "user:list"), false);

// --- Notas de servicio -------------------------------------------------------------------------
// The Operador receives the vehicle, inspects it and routes the job to a partner shop.
for (const key of [
	"nota:read",
	"nota:create",
	"nota:inspect",
	"nota:advance",
	"nota:transfer",
	"nota:comment",
] as const) {
	for (const role of ["admin", "gerente", "operador"] as const) {
		assert.equal(can(role, key), true, `${role} debe tener ${key}`);
	}
}
// Closing and cancelling stay with Admin/Gerente, the same split as cita:cancel.
for (const key of ["nota:close", "nota:cancel"] as const) {
	assert.equal(can("admin", key), true);
	assert.equal(can("gerente", key), true);
	assert.equal(can("operador", key), false, `operador no debe tener ${key}`);
}

// Partner workshops are onboarded by management; the counter only reads the list.
assert.equal(can("operador", "taller:read"), true);
assert.equal(can("operador", "taller:manage"), false);
assert.equal(can("gerente", "taller:manage"), true);

// --- Dinero ------------------------------------------------------------------------------------
// Operador drafts and records the customer's answer; anything that creates a receivable, sets a
// price commitment, or touches credit terms is Admin/Gerente.
assert.equal(can("operador", "cotizacion:create"), true);
assert.equal(can("operador", "cotizacion:authorize"), true);
assert.equal(can("operador", "cotizacion:send"), true, "el mostrador es quien tiene al cliente enfrente");
assert.equal(can("operador", "pago:register"), true, "el operador cobra en el mostrador");
assert.equal(can("operador", "factura:create"), false);
assert.equal(can("operador", "factura:cancel"), false);
assert.equal(can("operador", "cliente:credito"), false);
assert.equal(can("gerente", "factura:create"), true);
assert.equal(can("gerente", "cliente:credito"), true);

// THE ROLE `taller` STILL HOLDS NOTHING. Partner shops become users in their own change, with
// their own permission decisions — this assertion is what keeps that from drifting in quietly.
for (const key of [
	"nota:read",
	"nota:advance",
	"taller:read",
	"cotizacion:read",
	"factura:read",
	"pago:read",
] as const) {
	assert.equal(can("taller", key), false, `taller no debe tener ${key} todavía`);
}

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

// --- Registro de talleres ----------------------------------------------------------------------
// Deciding who becomes a certified partner is commercial, and the application carries the shop's
// RFC and the private notes written while judging it. `taller:read` (which an Operador holds, to
// pick a shop to send a truck to) deliberately does NOT come with it.
assert.equal(can("admin", "taller:review"), true);
assert.equal(can("gerente", "taller:review"), true);
assert.equal(can("operador", "taller:review"), false, "un Operador no revisa solicitudes de taller");
assert.equal(can("taller", "taller:review"), false);
assert.equal(can("operador", "taller:read"), true, "el Operador sí elige a qué taller mandar la unidad");

// --- Notificaciones ----------------------------------------------------------------------------
// Pushing a message AT somebody is a permission; reading your OWN inbox is not one, and must not
// become one — a `notificacion:read` key would put a permission on the `taller` role for the
// first time, and nobody has made that decision.
assert.equal(can("admin", "notificacion:send"), true);
assert.equal(can("gerente", "notificacion:send"), true);
assert.equal(can("operador", "notificacion:send"), false);
assert.equal(can("taller", "notificacion:send"), false);
assert.equal(
	Object.keys(PERMISSIONS).some((k) => k.startsWith("notificacion:") && k !== "notificacion:send"),
	false,
	"la bandeja propia no lleva permiso: va por requireUser, no por requirePermission",
);

// `taller` the ROLE is a mechanic; `taller` the ENTITY is a partner workshop we source jobs OUT
// to. A mechanic may now BELONG to one (`user.tallerId`), which widens which notes are in scope —
// and nothing else. The role still administers no workshop: belonging to a supplier is not the
// same as managing the registry of suppliers, and collapsing the two is the confusion made real.
assert.equal(can("taller", "taller:read"), false, "el mecánico no administra talleres aliados");
assert.equal(can("taller", "taller:manage"), false);
assert.equal(can("taller", "taller:review"), false);

// --- Eventos de notificación -------------------------------------------------------------------
// Every broadcast event fans out to "everyone holding this permission", so the audience of a
// notification can never be wider than the audience of the screen it links to. A typo'd key here
// would silently mean "nobody" (deny by default) — assert they all resolve.
for (const evento of NOTIFICACION_EVENTO_KEYS) {
	const def = NOTIFICACION_EVENTOS[evento] as { alcance: string; permiso?: string };
	if (def.alcance !== "difusion") continue;
	assert.ok(def.permiso, `${evento}: difusión sin permiso`);
	assert.ok(def.permiso! in PERMISSIONS, `${evento} apunta a ${def.permiso}, que no está en el registro de permisos`);
}

// Customer-facing events never fan out by permission — a customer holds none.
for (const evento of NOTIFICACION_EVENTO_KEYS) {
	const def = NOTIFICACION_EVENTOS[evento] as { audiencia: string; alcance: string };
	if (def.audiencia !== "cliente") continue;
	assert.equal(def.alcance, "directo", `${evento}: un aviso al cliente siempre tiene destinatario`);
}

// --- Catálogo e inventario ---------------------------------------------------------------------
// The counter quotes from the catalogue but does not set prices — the same split as
// `cliente:credito`.
assert.equal(can("operador", "producto:read"), true);
assert.equal(can("operador", "producto:manage"), false, "el mostrador no fija precios");
assert.equal(can("gerente", "producto:manage"), true);

// A mechanic never sees what the shop charges. `buscarParaTaller` is a different mapper with no
// price at all, which is why this permission is NOT theirs.
assert.equal(can("taller", "producto:read"), false, "el mecánico no ve precios de venta");

// Receiving goods and correcting stock move money; issuing a part to a job is daily work.
assert.equal(can("gerente", "inventario:entrada"), true);
assert.equal(can("operador", "inventario:entrada"), false);
assert.equal(can("operador", "inventario:salida"), true);
assert.equal(can("gerente", "inventario:ajuste"), true);
assert.equal(can("operador", "inventario:ajuste"), false, "un ajuste de existencias no es del mostrador");
assert.equal(can("taller", "inventario:salida"), false, "pedir no es surtir");

// --- Taller Mecánico ---------------------------------------------------------------------------
// The first permissions this role has ever held. The scope IS the point.
assert.deepEqual(permissionsFor("taller"), [
	"nota:comment",
	"inventario:solicitar",
	"nota:asignadas",
	"nota:diagnostico",
	"nota:evidencia",
]);

// Narrow, not wide: a mechanic sees the notes assigned to THEM. `nota:read` — the whole floor —
// is still not theirs, and `misNotas` scopes by `mecanicoId` in the query rather than filtering a
// full list afterwards, which is what makes that a real boundary.
assert.equal(can("taller", "nota:asignadas"), true);
assert.equal(can("taller", "nota:read"), false, "el mecánico NO ve el piso completo");

// Everything that decides for the customer or for the money stays out.
for (const key of [
	"nota:create",
	"nota:advance",
	"nota:transfer",
	"nota:close",
	"nota:cancel",
	"nota:inspect",
	"cotizacion:read",
	"cotizacion:create",
	"factura:read",
	"pago:read",
	"cliente:read",
	"unidad:read",
	"taller:read",
	"nota:asignar-mecanico",
] as const) {
	assert.equal(can("taller", key), false, `el mecánico no debe tener ${key}`);
}

// Photographing your own work is a different act from the intake walk-around, which is why the
// evidence trio moved off `nota:inspect`.
assert.equal(can("taller", "nota:evidencia"), true);
assert.equal(can("taller", "nota:inspect"), false, "la inspección de entrada la levanta el mostrador");

// A mechanic may comment — `comentarNota` FORCES interno for them, because writing to the customer
// belongs to whoever owns that relationship.
assert.equal(can("taller", "nota:comment"), true);

// Handing a job out is the counter's call, and the check in `asignarMecanico` is on the
// PERMISSION of the assignee, not on `role === 'taller'` — so it keeps working the day an Operador
// starts turning wrenches.
assert.equal(can("operador", "nota:asignar-mecanico"), true);
assert.equal(can("taller", "nota:asignar-mecanico"), false);

// --- Cotización: la pista interna ---------------------------------------------------------------
assert.equal(can("operador", "cotizacion:interno"), true);
assert.equal(can("taller", "cotizacion:interno"), false);
// Two different keys even though the Operador now holds both: one is what the customer was told,
// the other is what the shop is doing. The mechanic holds neither.
assert.equal(can("taller", "cotizacion:send"), false);
assert.notEqual(
	PERMISSIONS["cotizacion:send"],
	PERMISSIONS["cotizacion:interno"],
	"son claves distintas aunque hoy coincidan los roles",
);

// --- Timbrado y ajustes del sistema -------------------------------------------------------------
// Stamping is its own key even though it holds the same two roles as `factura:create` today. The
// line that matters is that the counter never reaches it: an Operador quotes and takes money, and
// neither of those spends a timbre or produces a fiscal document.
assert.equal(can("admin", "factura:timbrar"), true);
assert.equal(can("gerente", "factura:timbrar"), true);
assert.equal(can("operador", "factura:timbrar"), false, "el mostrador no timbra");
assert.equal(can("taller", "factura:timbrar"), false);

// Cancelling a stamped invoice deliberately reuses `factura:cancel`: once a PAC is wired,
// cancelling the row WITHOUT cancelling at the SAT is a lie, so that IS what cancelling means now.
assert.equal(can("operador", "factura:cancel"), false);

// The settings screen holds the PAC's credentials. Admin in the registry — and narrowed further by
// `esDuenoDelSistema`, because "an Admin may" and "which Admin" are different questions.
for (const clave of ["ajustes:read", "ajustes:manage"] as const) {
	assert.equal(can("admin", clave), true);
	for (const rol of ["gerente", "operador", "taller"] as const) {
		assert.equal(can(rol, clave), false, `${rol} no toca ${clave}`);
	}
}

// The `taller` role STILL holds nothing that is not about its own work — checked above, and
// re-checked here because two permission groups were added since.
assert.equal(can("taller", "ajustes:read"), false);
assert.equal(can("taller", "factura:read"), false);

console.log("check-roles: OK");
