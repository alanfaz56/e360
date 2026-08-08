import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { recordAudit } from "./audit";
import { ClienteError, getCliente, trim } from "./clientes";
import type { Actor } from "./guard";

/**
 * Several phone numbers per customer, one marked principal. `cliente.telefono` is kept as the
 * denormalized cache of that principal — same reasoning as `unidad.kilometraje` caching
 * `unidad_kilometraje`'s latest reading — so every existing reader of the column (the customer
 * list, the printable documents, the `tel:` links on notas/citas/unidades) never had to change.
 */

export const publicTelefono = (t: {
	id: string;
	clienteId: string;
	telefono: string;
	etiqueta: string | null;
	esPrincipal: boolean;
	archivedAt: Date | null;
	createdAt: Date;
}) => ({
	id: t.id,
	clienteId: t.clienteId,
	telefono: t.telefono,
	etiqueta: t.etiqueta,
	principal: t.esPrincipal,
	archivado: t.archivedAt !== null,
	createdAt: t.createdAt.toISOString(),
});

export async function listTelefonos(clienteId: string) {
	const rows = await prisma.cliente_telefono.findMany({
		where: { clienteId, archivedAt: null },
		orderBy: [{ esPrincipal: "desc" }, { createdAt: "asc" }],
	});
	return rows.map(publicTelefono);
}

/**
 * Demote whatever phone is currently principal. `cliente_telefono_principal_unica` is a partial
 * UNIQUE index, so promoting a second one without this fails the write instead of quietly
 * ending up with two. Runs inside the caller's transaction so there is never an instant with
 * two principals.
 */
async function despromoverPrincipal(tx: Prisma.TransactionClient, clienteId: string, excepto?: string) {
	await tx.cliente_telefono.updateMany({
		where: { clienteId, esPrincipal: true, archivedAt: null, ...(excepto ? { id: { not: excepto } } : {}) },
		data: { esPrincipal: false },
	});
}

export async function crearTelefono(input: { actor: Actor; clienteId: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cliente:update")) {
		throw new ClienteError(403, "Sin permiso: cliente:update");
	}

	const cliente = await getCliente(input.clienteId);
	const telefono = trim(input.body.telefono, 32, "El teléfono");
	if (!telefono) throw new ClienteError(400, "El teléfono es obligatorio");
	const etiqueta = trim(input.body.etiqueta, 40, "La etiqueta");

	const existentes = await prisma.cliente_telefono.count({ where: { clienteId: cliente.id, archivedAt: null } });
	// El primero de la lista siempre es principal — no tiene sentido un cliente sin ninguno.
	const esPrincipal = existentes === 0 || input.body.principal === true || input.body.principal === "on";

	const telefonoRow = await prisma.$transaction(async (tx) => {
		if (esPrincipal) await despromoverPrincipal(tx, cliente.id);

		const creado = await tx.cliente_telefono.create({
			data: { id: randomUUID(), clienteId: cliente.id, telefono, etiqueta, esPrincipal },
		});

		if (esPrincipal) {
			await tx.cliente.update({ where: { id: cliente.id }, data: { telefono: creado.telefono } });
		}

		await recordAudit(tx, {
			action: "telefono.create",
			actor: input.actor,
			entityId: creado.id,
			entityLabel: `${creado.telefono} (${cliente.nombreCompleto})`,
			summary: `Teléfono agregado a ${cliente.nombreCompleto}: ${creado.telefono}${esPrincipal ? " (principal)" : ""}`,
			after: { telefono: creado.telefono, principal: esPrincipal },
		});

		return creado;
	});

	return telefonoRow;
}

export async function actualizarTelefono(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cliente:update")) {
		throw new ClienteError(403, "Sin permiso: cliente:update");
	}

	const current = await prisma.cliente_telefono.findUnique({
		where: { id: input.id },
		include: { cliente: { select: { nombreCompleto: true } } },
	});
	if (!current || current.archivedAt) throw new ClienteError(404, "Teléfono no encontrado");

	const telefono = input.body.telefono === undefined ? current.telefono : trim(input.body.telefono, 32, "El teléfono");
	if (!telefono) throw new ClienteError(400, "El teléfono es obligatorio");
	const etiqueta = input.body.etiqueta === undefined ? current.etiqueta : trim(input.body.etiqueta, 40, "La etiqueta");
	const esPrincipal =
		input.body.principal === undefined ? current.esPrincipal : input.body.principal === true || input.body.principal === "on";

	const actualizado = await prisma.$transaction(async (tx) => {
		if (esPrincipal && !current.esPrincipal) await despromoverPrincipal(tx, current.clienteId, current.id);

		const guardado = await tx.cliente_telefono.update({
			where: { id: current.id },
			data: { telefono, etiqueta, esPrincipal },
		});

		if (esPrincipal) {
			await tx.cliente.update({ where: { id: current.clienteId }, data: { telefono: guardado.telefono } });
		}

		await recordAudit(tx, {
			action: esPrincipal && !current.esPrincipal ? "telefono.principal" : "telefono.update",
			actor: input.actor,
			entityId: guardado.id,
			entityLabel: `${guardado.telefono} (${current.cliente.nombreCompleto})`,
			summary:
				esPrincipal && !current.esPrincipal
					? `${guardado.telefono} marcado como principal en ${current.cliente.nombreCompleto}`
					: `Teléfono actualizado en ${current.cliente.nombreCompleto}: ${guardado.telefono}`,
			before: { telefono: current.telefono, principal: current.esPrincipal },
			after: { telefono: guardado.telefono, principal: esPrincipal },
		});

		return guardado;
	});

	return actualizado;
}

/** Archives, never deletes — same as cliente_contacto. If it was the principal, promotes another. */
export async function eliminarTelefono(input: { actor: Actor; id: string }) {
	if (!can(input.actor.role, "cliente:update")) {
		throw new ClienteError(403, "Sin permiso: cliente:update");
	}

	const current = await prisma.cliente_telefono.findUnique({
		where: { id: input.id },
		include: { cliente: { select: { nombreCompleto: true } } },
	});
	if (!current || current.archivedAt) throw new ClienteError(404, "Teléfono no encontrado");

	await prisma.$transaction(async (tx) => {
		await tx.cliente_telefono.update({ where: { id: current.id }, data: { archivedAt: new Date() } });

		if (current.esPrincipal) {
			const siguiente = await tx.cliente_telefono.findFirst({
				where: { clienteId: current.clienteId, archivedAt: null, id: { not: current.id } },
				orderBy: { createdAt: "desc" },
			});
			if (siguiente) {
				await tx.cliente_telefono.update({ where: { id: siguiente.id }, data: { esPrincipal: true } });
			}
			await tx.cliente.update({ where: { id: current.clienteId }, data: { telefono: siguiente?.telefono ?? null } });
		}

		await recordAudit(tx, {
			action: "telefono.delete",
			actor: input.actor,
			entityId: current.id,
			entityLabel: `${current.telefono} (${current.cliente.nombreCompleto})`,
			summary: `Teléfono eliminado de ${current.cliente.nombreCompleto}: ${current.telefono}`,
			before: { telefono: current.telefono, principal: current.esPrincipal },
		});
	});

	return current;
}
