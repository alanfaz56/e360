import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { REGIMENES_FISCALES, USOS_CFDI, type SatEntry } from "$lib/sat-catalogos";
import { recordAudit } from "./audit";
import { pageMeta, parsePageParams, skipFor, type PageParams } from "./paginate";
import type { Actor } from "./guard";

/** Thrown for anything the caller did wrong; routes map `.status` straight to HTTP. */
export class ClienteError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

export const CLIENTE_TIPOS = ["persona", "organizacion"] as const;
export type ClienteTipo = (typeof CLIENTE_TIPOS)[number];

export const CLIENTE_TIPO_LABEL: Record<ClienteTipo, string> = {
	persona: "Persona",
	organizacion: "Organización",
};

const isTipo = (v: unknown): v is ClienteTipo =>
	typeof v === "string" && (CLIENTE_TIPOS as readonly string[]).includes(v);

/**
 * Trim to null, refusing anything longer than the column allows. Shared by contactos and
 * unidades too — without the `max` the database rejects it with "value too long for the
 * column's type. Column: (not available)", which tells the user nothing.
 */
export function trim(v: unknown, max?: number, label?: string): string | null {
	if (typeof v !== "string") return null;
	const t = v.trim();
	if (t === "") return null;
	if (max !== undefined && t.length > max) {
		throw new ClienteError(400, `${label ?? "El campo"} no puede pasar de ${max} caracteres`);
	}
	return t;
}

/**
 * The denormalized display name. Rewritten on every write so the list can search and sort
 * one indexed column instead of a COALESCE across three.
 */
function buildNombreCompleto(input: {
	tipo: ClienteTipo;
	nombre: string | null;
	apellidos: string | null;
	razonSocial: string | null;
}): string {
	return input.tipo === "persona"
		? [input.nombre, input.apellidos].filter(Boolean).join(" ")
		: (input.razonSocial ?? "");
}

/** Validate and normalize the writable fields. Mirrors the CHECK constraints in the DDL. */
function readClienteInput(body: Record<string, unknown>, { partial = false } = {}) {
	const tipo = body.tipo;
	if (!partial || tipo !== undefined) {
		if (!isTipo(tipo)) throw new ClienteError(400, "Tipo inválido: usa 'persona' u 'organizacion'");
	}

	const data = {
		tipo: tipo as ClienteTipo | undefined,
		nombre: trim(body.nombre, 120, "El nombre"),
		apellidos: trim(body.apellidos, 120, "Los apellidos"),
		razonSocial: trim(body.razonSocial, 200, "La razón social"),
		telefono: trim(body.telefono, 32, "El teléfono"),
		email: trim(body.email, 255, "El correo"),
		direccion: trim(body.direccion, 500, "La dirección"),
		notas: trim(body.notas),
		rfc: trim(body.rfc, 13, "El RFC")?.toUpperCase() ?? null,
		regimenFiscal: satClave(REGIMENES_FISCALES, body.regimenFiscal, "régimen fiscal"),
		codigoPostal: trim(body.codigoPostal, 5, "El código postal"),
		usoCfdi: satClave(USOS_CFDI, body.usoCfdi, "uso de CFDI"),
	};

	if (data.rfc && data.rfc.length < 12) {
		throw new ClienteError(400, "El RFC debe tener 12 o 13 caracteres");
	}
	if (data.codigoPostal && !/^\d{5}$/.test(data.codigoPostal)) {
		throw new ClienteError(400, "El código postal debe ser de 5 dígitos");
	}

	return data;
}

/**
 * A SAT catalog key, or 400. Stored as the bare clave ("601", "G03") — never the label, which
 * is what a free-text box invites and what no invoicing system can consume.
 */
function satClave(catalogo: readonly SatEntry[], value: unknown, campo: string): string | null {
	const clave = trim(value);
	if (!clave) return null;
	if (!catalogo.some((e) => e.clave === clave)) {
		throw new ClienteError(400, `Clave de ${campo} inválida: ${clave}`);
	}
	return clave;
}

function assertNombrePorTipo(tipo: ClienteTipo, nombre: string | null, razonSocial: string | null) {
	if (tipo === "persona" && !nombre) throw new ClienteError(400, "El nombre es obligatorio");
	if (tipo === "organizacion" && !razonSocial) {
		throw new ClienteError(400, "La razón social es obligatoria");
	}
}

/** Shape returned by the API. Explicit mapper — never spread a Prisma row (Rule 4). */
export const publicCliente = (c: {
	id: string;
	tipo: string;
	nombre: string | null;
	apellidos: string | null;
	razonSocial: string | null;
	nombreCompleto: string;
	telefono: string | null;
	email: string | null;
	direccion: string | null;
	notas: string | null;
	rfc: string | null;
	regimenFiscal: string | null;
	codigoPostal: string | null;
	usoCfdi: string | null;
	archivedAt: Date | null;
	createdAt: Date;
}) => ({
	id: c.id,
	tipo: c.tipo,
	tipoLabel: CLIENTE_TIPO_LABEL[c.tipo as ClienteTipo] ?? c.tipo,
	nombre: c.nombre,
	apellidos: c.apellidos,
	razonSocial: c.razonSocial,
	nombreCompleto: c.nombreCompleto,
	telefono: c.telefono,
	email: c.email,
	direccion: c.direccion,
	notas: c.notas,
	rfc: c.rfc,
	regimenFiscal: c.regimenFiscal,
	codigoPostal: c.codigoPostal,
	usoCfdi: c.usoCfdi,
	archivado: c.archivedAt !== null,
	createdAt: c.createdAt.toISOString(),
});

export type ClienteQuery = {
	q?: string | null;
	tipo?: string | null;
	archivados?: boolean;
} & Partial<PageParams>;

export function parseClienteQuery(params: URLSearchParams): ClienteQuery {
	return {
		q: params.get("q"),
		tipo: params.get("tipo"),
		// Archived rows are hidden unless explicitly asked for.
		archivados: params.get("archivados") === "1",
		...parsePageParams(params),
	};
}

export async function listClientes(query: ClienteQuery) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 25 };

	const where: Prisma.clienteWhereInput = {
		...(query.archivados ? {} : { archivedAt: null }),
		...(isTipo(query.tipo) ? { tipo: query.tipo } : {}),
		...(query.q
			? {
					OR: [
						{ nombreCompleto: { contains: query.q, mode: "insensitive" } },
						{ rfc: { contains: query.q, mode: "insensitive" } },
						{ telefono: { contains: query.q } },
						{ email: { contains: query.q, mode: "insensitive" } },
					],
				}
			: {}),
	};

	const [total, rows] = await Promise.all([
		prisma.cliente.count({ where }),
		prisma.cliente.findMany({
			where,
			orderBy: { nombreCompleto: "asc" },
			skip: skipFor(paging),
			take: paging.perPage,
			include: { _count: { select: { unidades: true, contactos: true } } },
		}),
	]);

	return {
		clientes: rows.map((row) => ({
			...publicCliente(row),
			unidades: row._count.unidades,
			contactos: row._count.contactos,
		})),
		...pageMeta(total, paging),
	};
}

export async function getCliente(id: string) {
	const cliente = await prisma.cliente.findUnique({ where: { id } });
	if (!cliente) throw new ClienteError(404, "Cliente no encontrado");
	return cliente;
}

/**
 * Create a customer. Caller MUST hold `cliente:create` — checked here so the API route and
 * the form action cannot drift.
 */
export async function createCliente(input: { actor: Actor; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cliente:create")) {
		throw new ClienteError(403, "Sin permiso: cliente:create");
	}

	const data = readClienteInput(input.body);
	const tipo = data.tipo as ClienteTipo;
	assertNombrePorTipo(tipo, data.nombre, data.razonSocial);

	const nombreCompleto = buildNombreCompleto({ ...data, tipo });

	const cliente = await prisma.cliente.create({
		data: { id: randomUUID(), ...data, tipo, nombreCompleto },
	});

	await recordAudit(prisma, {
		action: "cliente.create",
		actor: input.actor,
		entityId: cliente.id,
		entityLabel: cliente.nombreCompleto,
		summary: `Cliente creado: ${cliente.nombreCompleto} (${CLIENTE_TIPO_LABEL[tipo]})`,
		after: { tipo, nombreCompleto, rfc: cliente.rfc },
	});

	return cliente;
}

export async function updateCliente(input: {
	actor: Actor;
	id: string;
	body: Record<string, unknown>;
}) {
	if (!can(input.actor.role, "cliente:update")) {
		throw new ClienteError(403, "Sin permiso: cliente:update");
	}

	const current = await getCliente(input.id);
	const data = readClienteInput(input.body, { partial: true });
	const tipo = (data.tipo ?? current.tipo) as ClienteTipo;
	assertNombrePorTipo(tipo, data.nombre, data.razonSocial);

	const nombreCompleto = buildNombreCompleto({ ...data, tipo });

	const updated = await prisma.cliente.update({
		where: { id: current.id },
		data: { ...data, tipo, nombreCompleto },
	});

	await recordAudit(prisma, {
		action: "cliente.update",
		actor: input.actor,
		entityId: updated.id,
		entityLabel: updated.nombreCompleto,
		summary: `Cliente actualizado: ${updated.nombreCompleto}`,
		before: { nombreCompleto: current.nombreCompleto, telefono: current.telefono, rfc: current.rfc },
		after: { nombreCompleto: updated.nombreCompleto, telefono: updated.telefono, rfc: updated.rfc },
	});

	return updated;
}

/** Archive or restore. Reversible, and it never orphans a unit or a future work order. */
export async function setClienteArchivado(input: { actor: Actor; id: string; archivado: boolean }) {
	if (!can(input.actor.role, "cliente:archive")) {
		throw new ClienteError(403, "Sin permiso: cliente:archive");
	}

	const current = await getCliente(input.id);
	if ((current.archivedAt !== null) === input.archivado) {
		throw new ClienteError(409, input.archivado ? "El cliente ya está archivado." : "El cliente no está archivado.");
	}

	const updated = await prisma.cliente.update({
		where: { id: current.id },
		data: { archivedAt: input.archivado ? new Date() : null },
	});

	await recordAudit(prisma, {
		action: input.archivado ? "cliente.archive" : "cliente.restore",
		actor: input.actor,
		entityId: updated.id,
		entityLabel: updated.nombreCompleto,
		summary: `${updated.nombreCompleto} ${input.archivado ? "archivado" : "restaurado"}`,
		before: { archivado: !input.archivado },
		after: { archivado: input.archivado },
	});

	return updated;
}

/**
 * Hard delete, for records created by mistake. Admin only.
 *
 * Refused while the customer still owns units: the FK is ON DELETE RESTRICT, and failing
 * with a clear message beats surfacing a Postgres constraint error. Contacts cascade,
 * because a contact has no meaning without its customer.
 */
export async function deleteCliente(input: { actor: Actor; id: string }) {
	if (!can(input.actor.role, "cliente:delete")) {
		throw new ClienteError(403, "Sin permiso: cliente:delete");
	}

	const cliente = await getCliente(input.id);

	const unidades = await prisma.unidad.count({ where: { clienteId: cliente.id } });
	if (unidades > 0) {
		throw new ClienteError(
			409,
			`No se puede eliminar: el cliente tiene ${unidades} unidad(es). Transfiérelas o archiva el cliente.`,
		);
	}
	const historial = await prisma.unidad_propietario.count({ where: { clienteId: cliente.id } });
	if (historial > 0) {
		throw new ClienteError(
			409,
			"No se puede eliminar: el cliente aparece en el historial de propietarios de una unidad. Archívalo.",
		);
	}

	await prisma.cliente.delete({ where: { id: cliente.id } });

	// Audited AFTER the delete: the row is gone, which is exactly why the label snapshot
	// on audit_log matters.
	await recordAudit(prisma, {
		action: "cliente.delete",
		actor: input.actor,
		entityId: cliente.id,
		entityLabel: cliente.nombreCompleto,
		summary: `Cliente eliminado definitivamente: ${cliente.nombreCompleto}`,
		before: { tipo: cliente.tipo, nombreCompleto: cliente.nombreCompleto, rfc: cliente.rfc },
	});

	return cliente;
}
