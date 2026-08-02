import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { recordAudit } from "./audit";
import { ClienteError, getCliente, trim } from "./clientes";
import { pageMeta, parsePageParams, skipFor, type PageParams } from "./paginate";
import type { Actor } from "./guard";

const int = (v: unknown): number | null => {
	if (v === undefined || v === null || v === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? Math.trunc(n) : null;
};

/** How a unit is named in lists, audit entries and error messages. */
export const unidadLabel = (u: { marca: string; modelo: string; placas: string | null; numeroEconomico: string | null }) =>
	[`${u.marca} ${u.modelo}`, u.placas ?? u.numeroEconomico].filter(Boolean).join(" · ");

export const publicUnidad = (u: {
	id: string;
	clienteId: string;
	marca: string;
	modelo: string;
	anio: number | null;
	color: string | null;
	placas: string | null;
	vin: string | null;
	numeroEconomico: string | null;
	kilometraje: number | null;
	notas: string | null;
	archivedAt: Date | null;
	createdAt: Date;
	cliente?: { nombreCompleto: string } | null;
}) => ({
	id: u.id,
	clienteId: u.clienteId,
	clienteNombre: u.cliente?.nombreCompleto ?? null,
	marca: u.marca,
	modelo: u.modelo,
	anio: u.anio,
	color: u.color,
	placas: u.placas,
	vin: u.vin,
	numeroEconomico: u.numeroEconomico,
	kilometraje: u.kilometraje,
	notas: u.notas,
	etiqueta: unidadLabel(u),
	archivado: u.archivedAt !== null,
	createdAt: u.createdAt.toISOString(),
});

function readUnidadInput(body: Record<string, unknown>) {
	const marca = trim(body.marca, 60, "La marca");
	const modelo = trim(body.modelo, 60, "El modelo");
	if (!marca) throw new ClienteError(400, "La marca es obligatoria");
	if (!modelo) throw new ClienteError(400, "El modelo es obligatorio");

	const anio = int(body.anio);
	if (anio !== null && (anio < 1900 || anio > new Date().getFullYear() + 2)) {
		throw new ClienteError(400, "Año fuera de rango");
	}
	const kilometraje = int(body.kilometraje);
	if (kilometraje !== null && kilometraje < 0) {
		throw new ClienteError(400, "El kilometraje no puede ser negativo");
	}

	const vin = trim(body.vin, 24, "El VIN")?.toUpperCase() ?? null;
	if (vin && vin.length < 5) {
		throw new ClienteError(400, "El VIN debe tener entre 5 y 24 caracteres");
	}

	return {
		marca,
		modelo,
		anio,
		color: trim(body.color, 40, "El color"),
		placas: trim(body.placas, 16, "Las placas")?.toUpperCase() ?? null,
		vin,
		numeroEconomico: trim(body.numeroEconomico, 32, "El número económico"),
		kilometraje,
		notas: trim(body.notas),
	};
}

/** VIN is globally unique when present; surface that as a clear message, not a DB error. */
async function assertVinLibre(vin: string | null, exceptId?: string) {
	if (!vin) return;
	const existing = await prisma.unidad.findUnique({
		where: { vin },
		select: { id: true, clienteId: true },
	});
	if (existing && existing.id !== exceptId) {
		throw new ClienteError(409, `Ya existe una unidad registrada con el VIN ${vin}`);
	}
}

export type UnidadQuery = {
	q?: string | null;
	clienteId?: string | null;
	archivados?: boolean;
} & Partial<PageParams>;

export function parseUnidadQuery(params: URLSearchParams): UnidadQuery {
	return {
		q: params.get("q"),
		clienteId: params.get("clienteId"),
		archivados: params.get("archivados") === "1",
		...parsePageParams(params),
	};
}

export async function listUnidades(query: UnidadQuery) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 25 };

	const where: Prisma.unidadWhereInput = {
		...(query.archivados ? {} : { archivedAt: null }),
		...(query.clienteId ? { clienteId: query.clienteId } : {}),
		...(query.q
			? {
					OR: [
						{ placas: { contains: query.q, mode: "insensitive" } },
						{ vin: { contains: query.q, mode: "insensitive" } },
						{ numeroEconomico: { contains: query.q, mode: "insensitive" } },
						{ marca: { contains: query.q, mode: "insensitive" } },
						{ modelo: { contains: query.q, mode: "insensitive" } },
						{ cliente: { nombreCompleto: { contains: query.q, mode: "insensitive" } } },
					],
				}
			: {}),
	};

	const [total, rows] = await Promise.all([
		prisma.unidad.count({ where }),
		prisma.unidad.findMany({
			where,
			orderBy: [{ marca: "asc" }, { modelo: "asc" }],
			skip: skipFor(paging),
			take: paging.perPage,
			include: { cliente: { select: { nombreCompleto: true } } },
		}),
	]);

	return { unidades: rows.map(publicUnidad), ...pageMeta(total, paging) };
}

export async function getUnidad(id: string) {
	const unidad = await prisma.unidad.findUnique({
		where: { id },
		include: { cliente: { select: { nombreCompleto: true } } },
	});
	if (!unidad) throw new ClienteError(404, "Unidad no encontrada");
	return unidad;
}

/** Ownership history, newest first. Current owner is the row with `hasta` null. */
export async function listPropietarios(unidadId: string) {
	const rows = await prisma.unidad_propietario.findMany({
		where: { unidadId },
		orderBy: { desde: "desc" },
		include: { cliente: { select: { id: true, nombreCompleto: true } } },
	});
	return rows.map((row) => ({
		id: row.id,
		clienteId: row.clienteId,
		clienteNombre: row.cliente.nombreCompleto,
		desde: row.desde.toISOString(),
		hasta: row.hasta?.toISOString() ?? null,
		actual: row.hasta === null,
		motivo: row.motivo,
	}));
}

/**
 * Register a unit. Opens its first ownership period in the same transaction, so
 * `unidad.clienteId` and the open `unidad_propietario` row are never out of step.
 */
export async function createUnidad(input: {
	actor: Actor;
	clienteId: string;
	body: Record<string, unknown>;
}) {
	if (!can(input.actor.role, "unidad:create")) {
		throw new ClienteError(403, "Sin permiso: unidad:create");
	}

	const cliente = await getCliente(input.clienteId);
	if (cliente.archivedAt) throw new ClienteError(409, "No se pueden agregar unidades a un cliente archivado.");

	const data = readUnidadInput(input.body);
	await assertVinLibre(data.vin);

	const unidad = await prisma.$transaction(async (tx) => {
		const row = await tx.unidad.create({
			data: { id: randomUUID(), clienteId: cliente.id, ...data },
		});
		await tx.unidad_propietario.create({
			data: {
				id: randomUUID(),
				unidadId: row.id,
				clienteId: cliente.id,
				motivo: "Alta de la unidad",
			},
		});
		await recordAudit(tx, {
			action: "unidad.create",
			actor: input.actor,
			entityId: row.id,
			entityLabel: unidadLabel(row),
			summary: `Unidad ${unidadLabel(row)} registrada para ${cliente.nombreCompleto}`,
			after: { clienteId: cliente.id, placas: row.placas, vin: row.vin },
		});
		return row;
	});

	return unidad;
}

export async function updateUnidad(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "unidad:update")) {
		throw new ClienteError(403, "Sin permiso: unidad:update");
	}

	const current = await getUnidad(input.id);
	const data = readUnidadInput(input.body);
	await assertVinLibre(data.vin, current.id);

	const updated = await prisma.unidad.update({ where: { id: current.id }, data });

	await recordAudit(prisma, {
		action: "unidad.update",
		actor: input.actor,
		entityId: updated.id,
		entityLabel: unidadLabel(updated),
		summary: `Unidad ${unidadLabel(updated)} actualizada`,
		before: { placas: current.placas, vin: current.vin, kilometraje: current.kilometraje },
		after: { placas: updated.placas, vin: updated.vin, kilometraje: updated.kilometraje },
	});

	return updated;
}

export async function setUnidadArchivada(input: { actor: Actor; id: string; archivado: boolean }) {
	if (!can(input.actor.role, "unidad:archive")) {
		throw new ClienteError(403, "Sin permiso: unidad:archive");
	}

	const current = await getUnidad(input.id);
	if ((current.archivedAt !== null) === input.archivado) {
		throw new ClienteError(409, input.archivado ? "La unidad ya está archivada." : "La unidad no está archivada.");
	}

	const updated = await prisma.unidad.update({
		where: { id: current.id },
		data: { archivedAt: input.archivado ? new Date() : null },
	});

	await recordAudit(prisma, {
		action: input.archivado ? "unidad.archive" : "unidad.restore",
		actor: input.actor,
		entityId: updated.id,
		entityLabel: unidadLabel(updated),
		summary: `Unidad ${unidadLabel(updated)} ${input.archivado ? "archivada" : "restaurada"}`,
		before: { archivado: !input.archivado },
		after: { archivado: input.archivado },
	});

	return updated;
}

export async function deleteUnidad(input: { actor: Actor; id: string }) {
	if (!can(input.actor.role, "unidad:delete")) {
		throw new ClienteError(403, "Sin permiso: unidad:delete");
	}

	const unidad = await getUnidad(input.id);
	// Ownership history and authorization links cascade — they mean nothing without the unit.
	await prisma.unidad.delete({ where: { id: unidad.id } });

	await recordAudit(prisma, {
		action: "unidad.delete",
		actor: input.actor,
		entityId: unidad.id,
		entityLabel: unidadLabel(unidad),
		summary: `Unidad ${unidadLabel(unidad)} eliminada definitivamente`,
		before: { clienteId: unidad.clienteId, placas: unidad.placas, vin: unidad.vin },
	});

	return unidad;
}

/**
 * Move a unit to another customer. Admin only, `motivo` required.
 *
 * One transaction does all four things: close the open ownership period, open a new one,
 * move the denormalized `unidad.clienteId` pointer, and record the audit entry. The
 * partial unique index on (unidadId) WHERE hasta IS NULL means a version of this that
 * forgot to close the previous period would fail loudly rather than leave two current
 * owners.
 *
 * Service history is NOT moved: it belongs to the unit. Future work orders store the
 * customer they were billed to, so past invoices stay with the previous owner while the
 * vehicle keeps one continuous maintenance record.
 */
export async function transferUnidad(input: {
	actor: Actor;
	id: string;
	clienteId: unknown;
	motivo: unknown;
}) {
	if (!can(input.actor.role, "unidad:transfer")) {
		throw new ClienteError(403, "Sin permiso: unidad:transfer");
	}

	const motivo = trim(input.motivo, 255, "El motivo");
	if (!motivo) throw new ClienteError(400, "El motivo de la transferencia es obligatorio");
	if (typeof input.clienteId !== "string" || !input.clienteId) {
		throw new ClienteError(400, "Se requiere `clienteId`");
	}

	const unidad = await getUnidad(input.id);
	if (unidad.clienteId === input.clienteId) {
		throw new ClienteError(409, "La unidad ya pertenece a ese cliente.");
	}

	const destino = await getCliente(input.clienteId);
	if (destino.archivedAt) throw new ClienteError(409, "No se puede transferir a un cliente archivado.");

	const origenNombre = unidad.cliente?.nombreCompleto ?? unidad.clienteId;

	return prisma.$transaction(async (tx) => {
		const ahora = new Date();

		await tx.unidad_propietario.updateMany({
			where: { unidadId: unidad.id, hasta: null },
			data: { hasta: ahora },
		});
		await tx.unidad_propietario.create({
			data: {
				id: randomUUID(),
				unidadId: unidad.id,
				clienteId: destino.id,
				desde: ahora,
				motivo,
			},
		});
		const updated = await tx.unidad.update({
			where: { id: unidad.id },
			data: { clienteId: destino.id },
		});

		// Drop every per-unit authorization pointing at this vehicle. They belong to the OLD
		// owner's contacts, and leaving them would let the previous owner's people collect a
		// car that is no longer theirs. The new owner re-authorizes explicitly.
		//
		// A contact restricted to only this unit is left with none, which means authorized
		// for nothing — the safe direction to fail in.
		const revocadas = await tx.contacto_unidad.deleteMany({ where: { unidadId: unidad.id } });

		await recordAudit(tx, {
			action: "unidad.transfer",
			actor: input.actor,
			entityId: updated.id,
			entityLabel: unidadLabel(updated),
			summary: `${unidadLabel(updated)}: ${origenNombre} → ${destino.nombreCompleto}. Motivo: ${motivo}`,
			before: { clienteId: unidad.clienteId, cliente: origenNombre },
			after: {
				clienteId: destino.id,
				cliente: destino.nombreCompleto,
				motivo,
				autorizacionesRevocadas: revocadas.count,
			},
		});

		return updated;
	});
}
