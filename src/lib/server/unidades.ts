import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { recordAudit } from "./audit";
import { ClienteError, getCliente, trim } from "./clientes";
import { registrarKilometraje } from "./notas";
import { NOTA_ESTADOS_ABIERTOS } from "$lib/notas";
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

/**
 * Vehicles that plausibly match what a customer typed on the public form, best match first.
 *
 * Ranked rather than filtered, because the strength of the signal differs enormously: a VIN or a
 * plate identifies ONE vehicle, while a marca just narrows it to "a Nissan". Returning them in
 * one flat list would bury the exact hit under twenty same-brand trucks.
 *
 * `clienteId` scopes it to one customer's fleet. Left out, it searches every customer — which is
 * how a returning customer is recognised from their plates alone, owner and all.
 */
export async function sugerirUnidades(input: {
	placas?: string | null;
	vin?: string | null;
	marca?: string | null;
	modelo?: string | null;
	clienteId?: string | null;
	limite?: number;
}) {
	const placas = input.placas?.trim() || null;
	const vin = input.vin?.trim() || null;
	const marca = input.marca?.trim() || null;
	if (!placas && !vin && !marca) return [];

	const rows = await prisma.unidad.findMany({
		where: {
			archivedAt: null,
			...(input.clienteId ? { clienteId: input.clienteId } : {}),
			OR: [
				...(placas ? [{ placas: { contains: placas, mode: "insensitive" as const } }] : []),
				...(vin ? [{ vin: { contains: vin, mode: "insensitive" as const } }] : []),
				...(marca ? [{ marca: { contains: marca, mode: "insensitive" as const } }] : []),
			],
		},
		orderBy: [{ marca: "asc" }, { modelo: "asc" }],
		take: 50,
		include: { cliente: { select: { nombreCompleto: true } } },
	});

	const igual = (a: string | null, b: string | null) =>
		Boolean(a && b) && a!.toLowerCase() === b!.toLowerCase();

	const puntuar = (u: (typeof rows)[number]) => {
		if (igual(u.vin, vin)) return 0; // the VIN is the vehicle's identity
		if (igual(u.placas, placas)) return 1;
		if (placas && u.placas?.toLowerCase().includes(placas.toLowerCase())) return 2;
		if (igual(u.modelo, input.modelo ?? null) && igual(u.marca, marca)) return 3;
		return 4; // same brand only
	};

	return rows
		.map((u) => ({ ...publicUnidad(u), coincidencia: puntuar(u) }))
		.sort((a, b) => a.coincidencia - b.coincidencia)
		.slice(0, input.limite ?? 6)
		.map((u) => ({
			...u,
			// Why this one is being suggested, said in the UI so a wrong pick is obvious.
			motivo:
				u.coincidencia === 0
					? "Mismo VIN"
					: u.coincidencia <= 2
						? "Placas coinciden"
						: u.coincidencia === 3
							? "Misma marca y modelo"
							: "Misma marca",
		}));
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
		// The odometer at registration is the FIRST point on the mileage curve. Without it the
		// unit's history only starts at its first visit, and "how much has it run since we knew
		// it" has nothing to measure from.
		if (row.kilometraje !== null) {
			await registrarKilometraje(tx, {
				actor: input.actor,
				unidadId: row.id,
				kilometraje: row.kilometraje,
				origen: "alta",
			});
		}
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

/** Scalar fields the admin may pull from the duplicate instead of leaving the keeper's own value. */
export const CAMPOS_FUSIONABLES_UNIDAD = [
	"marca",
	"modelo",
	"anio",
	"color",
	"placas",
	"vin",
	"numeroEconomico",
	"notas",
] as const;
export type CampoFusionableUnidad = (typeof CAMPOS_FUSIONABLES_UNIDAD)[number];

/**
 * Combine two vehicle records: everything the duplicate had (notas, citas, kilometraje,
 * per-unit pickup authorizations) moves to the keeper, and the duplicate is archived
 * (reversible). Modeled on `mergeClientes` in clientes.ts — one `motivo`, one transaction, one
 * audit entry with the counts of what moved.
 *
 * `clienteId` is never touched: fusing two vehicle records is not the same decision as
 * deciding who owns the truck now — that is `transferUnidad`'s job, not this one.
 */
export async function mergeUnidades(input: {
	actor: Actor;
	keeperId: string;
	duplicadoId: string;
	motivo: unknown;
	camposElegidos?: Partial<Record<CampoFusionableUnidad, "keeper" | "duplicado">>;
}) {
	if (!can(input.actor.role, "unidad:merge")) {
		throw new ClienteError(403, "Sin permiso: unidad:merge");
	}

	const motivo = trim(input.motivo, 255, "El motivo");
	if (!motivo) throw new ClienteError(400, "El motivo de la fusión es obligatorio");
	if (input.keeperId === input.duplicadoId) {
		throw new ClienteError(400, "No se puede fusionar una unidad consigo misma");
	}

	const keeper = await getUnidad(input.keeperId);
	const duplicado = await getUnidad(input.duplicadoId);
	if (duplicado.archivedAt) {
		throw new ClienteError(409, "Esa unidad ya está archivada — probablemente ya se fusionó.");
	}

	// Una sola nota abierta por unidad (nota_servicio_unidad_abierta_key). Si ambas tienen una
	// abierta a la vez, repuntarlas chocaría con esa regla — se rechaza antes de escribir nada
	// en vez de forzar el cierre de un trabajo en curso.
	const [notaAbiertaKeeper, notaAbiertaDuplicado] = await Promise.all([
		prisma.nota_servicio.findFirst({
			where: { unidadId: keeper.id, estado: { in: NOTA_ESTADOS_ABIERTOS } },
			select: { folio: true },
		}),
		prisma.nota_servicio.findFirst({
			where: { unidadId: duplicado.id, estado: { in: NOTA_ESTADOS_ABIERTOS } },
			select: { folio: true },
		}),
	]);
	if (notaAbiertaKeeper && notaAbiertaDuplicado) {
		throw new ClienteError(
			409,
			`Las dos unidades tienen una nota abierta (#${notaAbiertaKeeper.folio} y #${notaAbiertaDuplicado.folio}). Cierra o entrega una antes de fusionar.`,
		);
	}

	const resultado = await prisma.$transaction(async (tx) => {
		const ahora = new Date();

		const [notas, citas] = await Promise.all([
			tx.nota_servicio.updateMany({ where: { unidadId: duplicado.id }, data: { unidadId: keeper.id } }),
			tx.cita.updateMany({ where: { unidadId: duplicado.id }, data: { unidadId: keeper.id } }),
		]);

		// contacto_unidad tiene PK compuesta (contactoId, unidadId) — un contacto ya autorizado
		// en ambas chocaría al repuntar. Esas filas del duplicado sobran (ya tiene acceso vía el
		// keeper); se descartan en vez de fusionarlas.
		const [autorizacionesKeeper, autorizacionesDuplicado] = await Promise.all([
			tx.contacto_unidad.findMany({ where: { unidadId: keeper.id }, select: { contactoId: true } }),
			tx.contacto_unidad.findMany({ where: { unidadId: duplicado.id }, select: { contactoId: true } }),
		]);
		const yaAutorizados = new Set(autorizacionesKeeper.map((a) => a.contactoId));
		const repetidos = autorizacionesDuplicado.filter((a) => yaAutorizados.has(a.contactoId)).map((a) => a.contactoId);
		if (repetidos.length > 0) {
			await tx.contacto_unidad.deleteMany({ where: { unidadId: duplicado.id, contactoId: { in: repetidos } } });
		}
		const autorizacionesMovidas = await tx.contacto_unidad.updateMany({
			where: { unidadId: duplicado.id },
			data: { unidadId: keeper.id },
		});

		// Kilometraje: se mueven todas las lecturas y el denormalizado del keeper se recalcula
		// con la más reciente del conjunto ya unido — igual que registrarKilometraje lo mantiene.
		await tx.unidad_kilometraje.updateMany({ where: { unidadId: duplicado.id }, data: { unidadId: keeper.id } });
		const lecturaMasReciente = await tx.unidad_kilometraje.findFirst({
			where: { unidadId: keeper.id },
			orderBy: { medidoAt: "desc" },
		});

		// Campos propios: por default el keeper se queda como está. Solo se toca lo que el admin
		// marcó explícitamente "duplicado".
		const camposElegidos = input.camposElegidos ?? {};
		const datosElegidos: Record<string, string | number | null> = {};
		for (const campo of CAMPOS_FUSIONABLES_UNIDAD) {
			if (camposElegidos[campo] === "duplicado") datosElegidos[campo] = duplicado[campo];
		}
		if (lecturaMasReciente) datosElegidos.kilometraje = lecturaMasReciente.kilometraje;

		const keeperActualizado = await tx.unidad.update({
			where: { id: keeper.id },
			data: datosElegidos,
		});

		const duplicadoArchivado = await tx.unidad.update({
			where: { id: duplicado.id },
			data: { archivedAt: ahora },
		});

		await recordAudit(tx, {
			action: "unidad.merge",
			actor: input.actor,
			entityId: keeper.id,
			entityLabel: unidadLabel(keeperActualizado),
			summary: `${unidadLabel(duplicado)} fusionada con ${unidadLabel(keeperActualizado)}. Motivo: ${motivo}`,
			before: { duplicadoId: duplicado.id, duplicado: unidadLabel(duplicado) },
			after: {
				keeperId: keeper.id,
				motivo,
				movidos: {
					notas: notas.count,
					citas: citas.count,
					autorizacionesMovidas: autorizacionesMovidas.count,
					autorizacionesDescartadas: repetidos.length,
					kilometraje: lecturaMasReciente?.kilometraje ?? null,
					camposTomadosDelDuplicado: Object.keys(datosElegidos).filter((k) => k !== "kilometraje"),
				},
			},
		});

		return duplicadoArchivado;
	});

	return resultado;
}
