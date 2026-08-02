import { randomUUID } from "node:crypto";
import prisma from "$lib/prisma";
import { can, canAssignContactoRole } from "$lib/roles";
import { contactoRoleLabel, isContactoRole, type ContactoRole } from "$lib/contacto-roles";
import { recordAudit } from "./audit";
import { ClienteError, getCliente, trim } from "./clientes";
import type { Actor } from "./guard";

export const ALCANCES = ["todas", "especificas"] as const;
export type Alcance = (typeof ALCANCES)[number];

/** Shape returned by the API. */
export const publicContacto = (c: {
	id: string;
	clienteId: string;
	nombre: string;
	telefono: string | null;
	email: string | null;
	identificacion: string | null;
	notas: string | null;
	roles: string[];
	alcanceUnidades: string;
	archivedAt: Date | null;
	createdAt: Date;
	unidadesAutorizadas?: { unidadId: string }[];
}) => ({
	id: c.id,
	clienteId: c.clienteId,
	nombre: c.nombre,
	telefono: c.telefono,
	email: c.email,
	identificacion: c.identificacion,
	notas: c.notas,
	roles: c.roles,
	rolesLabel: c.roles.map(contactoRoleLabel),
	alcanceUnidades: c.alcanceUnidades,
	unidadesAutorizadas: c.unidadesAutorizadas?.map((u) => u.unidadId) ?? [],
	archivado: c.archivedAt !== null,
	createdAt: c.createdAt.toISOString(),
});

function readRoles(value: unknown): ContactoRole[] {
	const raw = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
	const roles: ContactoRole[] = [];
	for (const item of raw) {
		if (!isContactoRole(item)) throw new ClienteError(400, `Rol de contacto desconocido: ${String(item)}`);
		if (!roles.includes(item)) roles.push(item);
	}
	return roles;
}

/**
 * The two-tier rule.
 *
 * Holding `contacto:manage` lets you create and edit contacts. Roles flagged `autoridad` —
 * the ones that let someone drive a customer's vehicle away or approve spending — also
 * need `contacto:grant-authority`.
 *
 * Checked on the DELTA, not the final state. Without that, an Operador could not fix the
 * phone number of a contact a Gerente had already made an Entregador: the save would carry
 * that role in the payload and be refused. Adding or removing an authority role is what
 * requires the extra permission; leaving one untouched does not.
 */
function assertRoleDelta(actor: Actor, before: string[], after: ContactoRole[]) {
	const changed = [
		...after.filter((r) => !before.includes(r)),
		...before.filter((r) => !after.includes(r as ContactoRole)),
	];

	for (const role of changed) {
		if (!canAssignContactoRole(actor.role, role)) {
			throw new ClienteError(
				403,
				`No puedes otorgar ni quitar el rol "${contactoRoleLabel(role)}". Pídeselo a un Gerente o Admin.`,
			);
		}
	}
}

/** Units the contact may collect, validated to belong to the same customer. */
async function resolveUnidades(clienteId: string, alcance: Alcance, value: unknown) {
	if (alcance === "todas") return [];

	const ids = (Array.isArray(value) ? value : []).filter((v): v is string => typeof v === "string");
	if (ids.length === 0) {
		throw new ClienteError(400, "Selecciona al menos una unidad, o cambia el alcance a 'todas'.");
	}

	const unidades = await prisma.unidad.findMany({
		where: { id: { in: ids }, clienteId },
		select: { id: true },
	});
	if (unidades.length !== ids.length) {
		throw new ClienteError(400, "Alguna unidad no existe o no pertenece a este cliente.");
	}
	return unidades.map((u) => u.id);
}

function readAlcance(value: unknown): Alcance {
	if (value === undefined || value === null || value === "") return "todas";
	if (typeof value !== "string" || !(ALCANCES as readonly string[]).includes(value)) {
		throw new ClienteError(400, "Alcance inválido: usa 'todas' o 'especificas'");
	}
	return value as Alcance;
}

export async function listContactos(clienteId: string) {
	const rows = await prisma.cliente_contacto.findMany({
		where: { clienteId },
		orderBy: { nombre: "asc" },
		include: { unidadesAutorizadas: { select: { unidadId: true } } },
	});
	return rows.map(publicContacto);
}

export async function createContacto(input: {
	actor: Actor;
	clienteId: string;
	body: Record<string, unknown>;
}) {
	if (!can(input.actor.role, "contacto:manage")) {
		throw new ClienteError(403, "Sin permiso: contacto:manage");
	}

	const cliente = await getCliente(input.clienteId);
	const nombre = trim(input.body.nombre, 200, "El nombre del contacto");
	if (!nombre) throw new ClienteError(400, "El nombre del contacto es obligatorio");

	const roles = readRoles(input.body.roles);
	assertRoleDelta(input.actor, [], roles);

	const alcance = readAlcance(input.body.alcanceUnidades);
	const unidadIds = await resolveUnidades(cliente.id, alcance, input.body.unidades);

	const contacto = await prisma.cliente_contacto.create({
		data: {
			id: randomUUID(),
			clienteId: cliente.id,
			nombre,
			telefono: trim(input.body.telefono, 32, "El teléfono"),
			email: trim(input.body.email, 255, "El correo"),
			identificacion: trim(input.body.identificacion, 120, "La identificación"),
			notas: trim(input.body.notas),
			roles,
			alcanceUnidades: alcance,
			unidadesAutorizadas: { create: unidadIds.map((unidadId) => ({ unidadId })) },
		},
		include: { unidadesAutorizadas: { select: { unidadId: true } } },
	});

	await recordAudit(prisma, {
		action: "contacto.create",
		actor: input.actor,
		entityId: contacto.id,
		entityLabel: `${contacto.nombre} (${cliente.nombreCompleto})`,
		summary: `Contacto ${contacto.nombre} agregado a ${cliente.nombreCompleto}${
			roles.length ? ` como ${roles.map(contactoRoleLabel).join(", ")}` : ""
		}`,
		after: { roles, alcanceUnidades: alcance, unidades: unidadIds.length },
	});

	return contacto;
}

export async function updateContacto(input: {
	actor: Actor;
	id: string;
	body: Record<string, unknown>;
}) {
	if (!can(input.actor.role, "contacto:manage")) {
		throw new ClienteError(403, "Sin permiso: contacto:manage");
	}

	const current = await prisma.cliente_contacto.findUnique({
		where: { id: input.id },
		include: { cliente: { select: { nombreCompleto: true } } },
	});
	if (!current) throw new ClienteError(404, "Contacto no encontrado");

	const nombre = trim(input.body.nombre, 200, "El nombre del contacto");
	if (!nombre) throw new ClienteError(400, "El nombre del contacto es obligatorio");

	const roles = readRoles(input.body.roles);
	assertRoleDelta(input.actor, current.roles, roles);

	const alcance = readAlcance(input.body.alcanceUnidades);
	const unidadIds = await resolveUnidades(current.clienteId, alcance, input.body.unidades);

	const updated = await prisma.$transaction(async (tx) => {
		await tx.contacto_unidad.deleteMany({ where: { contactoId: current.id } });
		const row = await tx.cliente_contacto.update({
			where: { id: current.id },
			data: {
				nombre,
				telefono: trim(input.body.telefono, 32, "El teléfono"),
				email: trim(input.body.email, 255, "El correo"),
				identificacion: trim(input.body.identificacion, 120, "La identificación"),
				notas: trim(input.body.notas),
				roles,
				alcanceUnidades: alcance,
				unidadesAutorizadas: { create: unidadIds.map((unidadId) => ({ unidadId })) },
			},
			include: { unidadesAutorizadas: { select: { unidadId: true } } },
		});

		await recordAudit(tx, {
			action: "contacto.update",
			actor: input.actor,
			entityId: row.id,
			entityLabel: `${row.nombre} (${current.cliente.nombreCompleto})`,
			summary: `Contacto ${row.nombre} actualizado`,
			before: { roles: current.roles, alcanceUnidades: current.alcanceUnidades },
			after: { roles, alcanceUnidades: alcance },
		});

		return row;
	});

	return updated;
}

/**
 * Remove a contact. Deleting one that holds an authority role is itself an authority
 * change, so it goes through the same delta check.
 */
export async function deleteContacto(input: { actor: Actor; id: string }) {
	if (!can(input.actor.role, "contacto:manage")) {
		throw new ClienteError(403, "Sin permiso: contacto:manage");
	}

	const current = await prisma.cliente_contacto.findUnique({
		where: { id: input.id },
		include: { cliente: { select: { nombreCompleto: true } } },
	});
	if (!current) throw new ClienteError(404, "Contacto no encontrado");

	assertRoleDelta(input.actor, current.roles, []);

	await prisma.cliente_contacto.delete({ where: { id: current.id } });

	await recordAudit(prisma, {
		action: "contacto.delete",
		actor: input.actor,
		entityId: current.id,
		entityLabel: `${current.nombre} (${current.cliente.nombreCompleto})`,
		summary: `Contacto ${current.nombre} eliminado de ${current.cliente.nombreCompleto}`,
		before: { roles: current.roles },
	});

	return current;
}
