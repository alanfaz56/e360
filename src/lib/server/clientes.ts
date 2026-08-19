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

	// In partial mode, a key the caller never sent must leave that column untouched — `undefined`
	// is Prisma's own "don't touch this field" value, distinct from an explicit null. Without this,
	// `trim(undefined)` quietly returns null for every field, and updateCliente's `{...data}`
	// spread would erase rfc/nombre/telefono/etc. on ANY partial edit that doesn't resend them.
	const campo = <T,>(clave: string, leer: () => T): T | undefined => (!partial || clave in body ? leer() : undefined);

	const data = {
		tipo: tipo as ClienteTipo | undefined,
		nombre: campo("nombre", () => trim(body.nombre, 120, "El nombre")),
		apellidos: campo("apellidos", () => trim(body.apellidos, 120, "Los apellidos")),
		razonSocial: campo("razonSocial", () => trim(body.razonSocial, 200, "La razón social")),
		telefono: campo("telefono", () => trim(body.telefono, 32, "El teléfono")),
		email: campo("email", () => trim(body.email, 255, "El correo")),
		direccion: campo("direccion", () => trim(body.direccion, 500, "La dirección")),
		notas: campo("notas", () => trim(body.notas)),
		rfc: campo("rfc", () => trim(body.rfc, 13, "El RFC")?.toUpperCase() ?? null),
		regimenFiscal: campo("regimenFiscal", () => satClave(REGIMENES_FISCALES, body.regimenFiscal, "régimen fiscal")),
		codigoPostal: campo("codigoPostal", () => trim(body.codigoPostal, 5, "El código postal")),
		usoCfdi: campo("usoCfdi", () => satClave(USOS_CFDI, body.usoCfdi, "uso de CFDI")),
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
	facturaComUid: string | null;
	facturaComEntorno: string | null;
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
	// The PAC's own handle for this customer, and which environment it was created in — a
	// sandbox link is meaningless in production. Not secret, just an external id; staff need
	// it to tell "never linked" from "linked, but in the wrong environment".
	facturaComUid: c.facturaComUid,
	facturaComEntorno: c.facturaComEntorno,
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
						// El principal ya está en `telefono` (denormalizado); esto alcanza los
						// secundarios sin duplicar la búsqueda.
						{ telefonos: { some: { telefono: { contains: query.q }, archivedAt: null } } },
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
	// Non-partial mode: `campo()` always calls its reader, so these are never actually undefined —
	// the `?? null` is only to satisfy the type `readClienteInput` shares with the partial path.
	const nombre = data.nombre ?? null;
	const apellidos = data.apellidos ?? null;
	const razonSocial = data.razonSocial ?? null;
	assertNombrePorTipo(tipo, nombre, razonSocial);

	const nombreCompleto = buildNombreCompleto({ tipo, nombre, apellidos, razonSocial });

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

	// nombreCompleto and the PAC-link check both need the EFFECTIVE value being saved — what this
	// request sent, else what the row already had — not just whatever fields happened to be in
	// THIS body. Using `data.nombre` etc. directly here would recompute nombreCompleto from
	// `undefined` pieces (and wrongly reject a partial edit for a "missing" name) on any update
	// that doesn't resend every fiscal field.
	const nombre = data.nombre !== undefined ? data.nombre : current.nombre;
	const apellidos = data.apellidos !== undefined ? data.apellidos : current.apellidos;
	const razonSocial = data.razonSocial !== undefined ? data.razonSocial : current.razonSocial;
	const rfc = data.rfc !== undefined ? data.rfc : current.rfc;

	assertNombrePorTipo(tipo, nombre, razonSocial);
	const nombreCompleto = buildNombreCompleto({ tipo, nombre, apellidos, razonSocial });

	// The PAC receptor is keyed by RFC and carries its own Nombre. If either changed, the
	// cached uid now names someone else — reusing it is how "Autentica de Modas" gets
	// stamped against a receptor still registered as the old persona. Clearing it here
	// forces vincularReceptor to look up (or create) the right one on the next timbrado.
	const rfcCambio = rfc !== current.rfc;
	const nombreCambio = nombreCompleto !== current.nombreCompleto;
	const limpiarPac = rfcCambio || nombreCambio ? { facturaComUid: null, facturaComEntorno: null } : {};

	const updated = await prisma.cliente.update({
		where: { id: current.id },
		data: { ...data, tipo, nombreCompleto, ...limpiarPac },
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

/**
 * Combine two customers: everything the duplicate owned moves to the keeper, and the
 * duplicate is archived (reversible — merges are corrections, not judgments).
 *
 * Modeled on `transferUnidad` in unidades.ts: one `motivo`, one transaction, one audit entry
 * with the counts of what moved. `rfc` and `facturaComUid`/`facturaComEntorno` are never
 * touched — neither has a uniqueness constraint, so there is nothing to collide, and the
 * keeper's own values simply stand.
 */
/** Scalar fields the admin may pull from the duplicate instead of leaving the keeper's own value. */
export const CAMPOS_FUSIONABLES = [
	"nombre",
	"apellidos",
	"razonSocial",
	"email",
	"direccion",
	"rfc",
	"regimenFiscal",
	"codigoPostal",
	"notas",
] as const;
export type CampoFusionable = (typeof CAMPOS_FUSIONABLES)[number];

export async function mergeClientes(input: {
	actor: Actor;
	keeperId: string;
	duplicadoId: string;
	motivo: unknown;
	/** cliente_contacto ids of the duplicate that SURVIVE, repointed to the keeper. The rest are archived. */
	contactosAConservar: string[];
	/** cliente_telefono ids of the duplicate that SURVIVE, repointed to the keeper. The rest are archived. */
	telefonosAConservar: string[];
	/** The duplicate itself becomes a `general` contact of the keeper — a phone number worth keeping, no authority. */
	crearContactoDelDuplicado?: boolean;
	/** Per field: keep the keeper's own value (default) or take the duplicate's. `telefono` is handled by `telefonosAConservar` instead. */
	camposElegidos?: Partial<Record<CampoFusionable, "keeper" | "duplicado">>;
}) {
	if (!can(input.actor.role, "cliente:merge")) {
		throw new ClienteError(403, "Sin permiso: cliente:merge");
	}

	const motivo = trim(input.motivo, 255, "El motivo");
	if (!motivo) throw new ClienteError(400, "El motivo de la fusión es obligatorio");
	if (input.keeperId === input.duplicadoId) {
		throw new ClienteError(400, "No se puede fusionar un cliente consigo mismo");
	}

	const keeper = await getCliente(input.keeperId);
	const duplicado = await getCliente(input.duplicadoId);
	if (duplicado.archivedAt) {
		throw new ClienteError(409, "Ese cliente ya está archivado — probablemente ya se fusionó.");
	}

	const contactosDelDuplicado = await prisma.cliente_contacto.findMany({
		where: { clienteId: duplicado.id, archivedAt: null },
		select: { id: true },
	});
	const idsValidos = new Set(contactosDelDuplicado.map((c) => c.id));
	const aConservar = input.contactosAConservar.filter((id) => idsValidos.has(id));

	const telefonosDelDuplicado = await prisma.cliente_telefono.findMany({
		where: { clienteId: duplicado.id, archivedAt: null },
		select: { id: true },
	});
	const idsTelefonoValidos = new Set(telefonosDelDuplicado.map((t) => t.id));
	const telefonosAConservar = input.telefonosAConservar.filter((id) => idsTelefonoValidos.has(id));

	const resultado = await prisma.$transaction(async (tx) => {
		const ahora = new Date();

		// `cotizacion` hangs off `notaId`, not its own `clienteId` — it moves for free once the
		// nota does, nothing to repoint here.
		const [unidades, propietarios, citas, notas, facturas] = await Promise.all([
			tx.unidad.updateMany({ where: { clienteId: duplicado.id }, data: { clienteId: keeper.id } }),
			tx.unidad_propietario.updateMany({ where: { clienteId: duplicado.id }, data: { clienteId: keeper.id } }),
			tx.cita.updateMany({ where: { clienteId: duplicado.id }, data: { clienteId: keeper.id } }),
			tx.nota_servicio.updateMany({ where: { clienteId: duplicado.id }, data: { clienteId: keeper.id } }),
			tx.factura.updateMany({ where: { clienteId: duplicado.id }, data: { clienteId: keeper.id } }),
		]);
		await tx.notificacion.updateMany({ where: { clienteId: duplicado.id }, data: { clienteId: keeper.id } });
		await tx.push_suscripcion.updateMany({ where: { clienteId: duplicado.id }, data: { clienteId: keeper.id } });

		let contactosMovidos = 0;
		if (aConservar.length > 0) {
			const movidos = await tx.cliente_contacto.updateMany({
				where: { id: { in: aConservar }, clienteId: duplicado.id },
				data: { clienteId: keeper.id },
			});
			contactosMovidos = movidos.count;
		}
		const contactosArchivados = await tx.cliente_contacto.updateMany({
			where: { clienteId: duplicado.id, archivedAt: null, id: { notIn: aConservar } },
			data: { archivedAt: ahora },
		});

		// Teléfonos elegidos del duplicado se repuntan; los demás se archivan. Ninguno se marca
		// principal aquí — el principal del keeper (la columna denormalizada) nunca cambia solo
		// porque se fusionó algo, así como no cambia su nombre o su RFC salvo que se elija.
		let telefonosMovidos = 0;
		if (telefonosAConservar.length > 0) {
			await tx.cliente_telefono.updateMany({
				where: { id: { in: telefonosAConservar }, clienteId: duplicado.id, esPrincipal: true },
				data: { esPrincipal: false },
			});
			const movidos = await tx.cliente_telefono.updateMany({
				where: { id: { in: telefonosAConservar }, clienteId: duplicado.id },
				data: { clienteId: keeper.id },
			});
			telefonosMovidos = movidos.count;
		}
		const telefonosArchivados = await tx.cliente_telefono.updateMany({
			where: { clienteId: duplicado.id, archivedAt: null, id: { notIn: telefonosAConservar } },
			data: { archivedAt: ahora },
		});

		// Campos propios: por default el keeper se queda como está. Solo se toca lo que el admin
		// marcó explícitamente "duplicado".
		const camposElegidos = input.camposElegidos ?? {};
		const datosElegidos: Record<string, string | null> = {};
		for (const campo of CAMPOS_FUSIONABLES) {
			if (camposElegidos[campo] === "duplicado") datosElegidos[campo] = duplicado[campo];
		}
		if (Object.keys(datosElegidos).length > 0) {
			const tipo = keeper.tipo as ClienteTipo;
			const nombreCompleto = buildNombreCompleto({
				tipo,
				nombre: (datosElegidos.nombre ?? keeper.nombre) as string | null,
				apellidos: (datosElegidos.apellidos ?? keeper.apellidos) as string | null,
				razonSocial: (datosElegidos.razonSocial ?? keeper.razonSocial) as string | null,
			});
			await tx.cliente.update({ where: { id: keeper.id }, data: { ...datosElegidos, nombreCompleto } });
		}

		const duplicadoArchivado = await tx.cliente.update({
			where: { id: duplicado.id },
			data: { archivedAt: ahora },
		});

		// El cliente fusionado desaparece como cliente, pero sigue siendo alguien real que llamó
		// antes — se conserva como contacto sin autoridad, no como una persona olvidada.
		let contactoDelDuplicadoId: string | null = null;
		if (input.crearContactoDelDuplicado) {
			const contacto = await tx.cliente_contacto.create({
				data: {
					id: randomUUID(),
					clienteId: keeper.id,
					nombre: duplicado.nombreCompleto,
					telefono: duplicado.telefono,
					email: duplicado.email,
					roles: ["general"],
					alcanceUnidades: "todas",
					notas: `Antes era su propio registro de cliente. Fusionado el ${ahora.toLocaleDateString("es-MX")}.`,
				},
			});
			contactoDelDuplicadoId = contacto.id;
		}

		await recordAudit(tx, {
			action: "cliente.merge",
			actor: input.actor,
			entityId: keeper.id,
			entityLabel: keeper.nombreCompleto,
			summary: `${duplicado.nombreCompleto} fusionado con ${keeper.nombreCompleto}. Motivo: ${motivo}`,
			before: { duplicadoId: duplicado.id, duplicado: duplicado.nombreCompleto },
			after: {
				keeperId: keeper.id,
				motivo,
				movidos: {
					unidades: unidades.count,
					unidadPropietario: propietarios.count,
					citas: citas.count,
					notas: notas.count,
					facturas: facturas.count,
					contactosMovidos,
					contactosArchivados: contactosArchivados.count,
					contactoDelDuplicadoId,
					telefonosMovidos,
					telefonosArchivados: telefonosArchivados.count,
					camposTomadosDelDuplicado: Object.keys(datosElegidos),
				},
			},
		});

		return duplicadoArchivado;
	});

	return resultado;
}
