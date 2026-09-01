import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { TALLER_PUEDE_RECIBIR, isTallerEstado, tallerEstadoLabel } from "$lib/talleres";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import { notificar } from "./notificaciones";
import { pageMeta, parsePageParams, skipFor, type PageParams } from "./paginate";
import { verifyTurnstile } from "./turnstile";
import type { Actor } from "./guard";
import { nombreMencionado } from "$lib/nombre-mencionado";

/**
 * Workshops. Mostly partners Estación 360 sources jobs out to — **and our own bay**, flagged
 * `esInterno`.
 *
 * That flag is why work is always assigned TO A TALLER rather than to a person: a job that stays
 * in-house takes the same path as one that goes out, and the mechanics who touch it are scoped by
 * `user.tallerId` either way. Assigning an individual mechanic was a second, parallel way to route
 * work, and the two disagreed about who could see what.
 *
 * Their people hold accounts through `user.tallerId`, set by `asignarMecanicoATaller`; only a
 * `taller` role may carry one, enforced by `user_taller_solo_rol_taller_check`.
 *
 * **The invisibility rule is about PARTNERS, not about us.** `tallerMencionado` skips internal
 * shops — telling a customer their truck is being worked on at Estación 360 is the opposite of
 * leaking a supplier.
 */

export const publicSucursal = (s: {
	id: string;
	nombre: string;
	direccion: string | null;
	ciudad: string | null;
	telefono: string | null;
	contactoNombre: string | null;
	contactoPuesto: string | null;
	contactoTelefono: string | null;
	contactoEmail: string | null;
	esPrincipal: boolean;
	archivedAt: Date | null;
}) => ({
	id: s.id,
	nombre: s.nombre,
	direccion: s.direccion,
	ciudad: s.ciudad,
	telefono: s.telefono,
	contactoNombre: s.contactoNombre,
	contactoPuesto: s.contactoPuesto,
	contactoTelefono: s.contactoTelefono,
	contactoEmail: s.contactoEmail,
	esPrincipal: s.esPrincipal,
	archivado: s.archivedAt !== null,
});

export const publicTaller = (t: {
	id: string;
	nombre: string;
	telefono: string | null;
	email: string | null;
	contacto: string | null;
	direccion: string | null;
	especialidades: string | null;
	notas: string | null;
	origen: string;
	estado: string;
	esInterno?: boolean;
	rfc: string | null;
	ciudad: string | null;
	sitioWeb: string | null;
	anosOperando: number | null;
	empleados: number | null;
	revisadoAt: Date | null;
	revisionMotivo: string | null;
	archivedAt: Date | null;
	createdAt: Date;
	_count?: { notas_recibidas: number; sucursales?: number };
	sucursales?: Parameters<typeof publicSucursal>[0][];
}) => ({
	id: t.id,
	nombre: t.nombre,
	telefono: t.telefono,
	email: t.email,
	contacto: t.contacto,
	direccion: t.direccion,
	especialidades: t.especialidades,
	notas: t.notas,
	origen: t.origen,
	estado: t.estado,
	estadoLabel: tallerEstadoLabel(t.estado),
	// Our own bay, not a partner. Screens sort it first and the invisibility rule skips it.
	esInterno: t.esInterno ?? false,
	rfc: t.rfc,
	ciudad: t.ciudad,
	sitioWeb: t.sitioWeb,
	anosOperando: t.anosOperando,
	empleados: t.empleados,
	revisadoAt: t.revisadoAt?.toISOString() ?? null,
	revisionMotivo: t.revisionMotivo,
	archivado: t.archivedAt !== null,
	notasRecibidas: t._count?.notas_recibidas ?? 0,
	sucursales: t.sucursales?.map(publicSucursal),
	createdAt: t.createdAt.toISOString(),
});

export type TallerQuery = {
	q?: string | null;
	archivados?: boolean;
	estado?: string | null;
} & Partial<PageParams>;

export function parseTallerQuery(params: URLSearchParams): TallerQuery {
	return {
		q: params.get("q"),
		archivados: params.get("archivados") === "1",
		estado: params.get("estado"),
		...parsePageParams(params),
	};
}

export async function listTalleres(query: TallerQuery, actor?: Actor) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 25 };

	// Applications are commercial, not operational: an Operador picks a shop to send a truck to
	// and has no business reading who applied and got turned down. Without `taller:review` the
	// list is the certified registry, whatever `?estado=` asks for.
	const puedeVerSolicitudes = can(actor?.role, "taller:review");
	const estado = puedeVerSolicitudes ? query.estado : "aprobado";

	const where: Prisma.tallerWhereInput = {
		...(query.archivados ? {} : { archivedAt: null }),
		...(estado ? { estado } : {}),
		...(query.q
			? {
					OR: [
						{ nombre: { contains: query.q, mode: "insensitive" } },
						{ contacto: { contains: query.q, mode: "insensitive" } },
						{ especialidades: { contains: query.q, mode: "insensitive" } },
						{ ciudad: { contains: query.q, mode: "insensitive" } },
						{ telefono: { contains: query.q } },
					],
				}
			: {}),
	};

	const [total, rows, porRevisar] = await Promise.all([
		prisma.taller.count({ where }),
		prisma.taller.findMany({
			where,
			// Applications first (the queue goes stale if nobody looks), then our own bay, then the
			// partners — which is also the order somebody picks from when sending a vehicle out.
			orderBy: [{ estado: "asc" }, { esInterno: "desc" }, { nombre: "asc" }],
			skip: skipFor(paging),
			take: paging.perPage,
			include: { _count: { select: { notas_recibidas: true } } },
		}),
		puedeVerSolicitudes
			? prisma.taller.count({ where: { estado: "solicitado", archivedAt: null } })
			: Promise.resolve(0),
	]);

	return { talleres: rows.map(publicTaller), porRevisar, ...pageMeta(total, paging) };
}

/** One workshop with its branches. */
export async function getTallerDetalle(id: string) {
	const taller = await prisma.taller.findUnique({
		where: { id },
		include: {
			_count: { select: { notas_recibidas: true } },
			sucursales: { orderBy: [{ esPrincipal: "desc" }, { nombre: "asc" }] },
		},
	});
	if (!taller) throw new ClienteError(404, "Taller no encontrado");
	return publicTaller(taller);
}

export async function getTaller(id: string) {
	const taller = await prisma.taller.findUnique({ where: { id } });
	if (!taller) throw new ClienteError(404, "Taller no encontrado");
	return taller;
}

/** Positive whole numbers only; a blank field stays null rather than becoming 0. */
function entero(v: unknown, max: number, label: string): number | null {
	const s = trim(v);
	if (s === null) return null;
	const n = Number(s);
	if (!Number.isInteger(n) || n < 0 || n > max) throw new ClienteError(400, `${label} no es un número válido`);
	return n;
}

function leerTallerInput(body: Record<string, unknown>) {
	const nombre = trim(body.nombre, 160, "El nombre");
	if (!nombre) throw new ClienteError(400, "El nombre del taller es obligatorio");

	return {
		nombre,
		telefono: trim(body.telefono, 32, "El teléfono"),
		email: trim(body.email, 255, "El correo"),
		contacto: trim(body.contacto, 120, "El contacto"),
		direccion: trim(body.direccion, 500, "La dirección"),
		especialidades: trim(body.especialidades, 500, "Las especialidades"),
		notas: trim(body.notas),
		rfc: trim(body.rfc, 13, "El RFC"),
		ciudad: trim(body.ciudad, 80, "La ciudad"),
		sitioWeb: trim(body.sitioWeb, 255, "El sitio web"),
		anosOperando: entero(body.anosOperando, 200, "Los años operando"),
		empleados: entero(body.empleados, 10000, "El número de empleados"),
		// Our own bay. Only ever set from the panel — `solicitarTaller` builds its row field by
		// field from its own whitelist, so an applicant cannot declare itself to be us.
		esInterno: body.esInterno === "1" || body.esInterno === "on" || body.esInterno === true,
	};
}

export async function createTaller(input: { actor: Actor; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "taller:manage")) throw new ClienteError(403, "Sin permiso: taller:manage");

	const data = leerTallerInput(input.body);
	// Staff adding a shop by hand IS the certification decision — they would not type it in
	// otherwise. The public form is the path that produces something to review.
	const taller = await prisma.taller.create({
		data: { id: randomUUID(), ...data, origen: "panel", estado: "aprobado" },
	});

	await recordAudit(prisma, {
		action: "taller.create",
		actor: input.actor,
		entityId: taller.id,
		entityLabel: taller.nombre,
		summary: `Taller aliado dado de alta: ${taller.nombre}`,
		after: { nombre: taller.nombre, especialidades: taller.especialidades },
	});

	return taller;
}

export async function updateTaller(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "taller:manage")) throw new ClienteError(403, "Sin permiso: taller:manage");

	const current = await getTaller(input.id);
	const data = leerTallerInput({
		nombre: current.nombre,
		telefono: current.telefono,
		email: current.email,
		contacto: current.contacto,
		direccion: current.direccion,
		especialidades: current.especialidades,
		notas: current.notas,
		...input.body,
	});

	const taller = await prisma.taller.update({ where: { id: current.id }, data });

	await recordAudit(prisma, {
		action: "taller.update",
		actor: input.actor,
		entityId: taller.id,
		entityLabel: taller.nombre,
		summary: `Taller actualizado: ${taller.nombre}`,
		before: { nombre: current.nombre, telefono: current.telefono, contacto: current.contacto },
		after: { nombre: taller.nombre, telefono: taller.telefono, contacto: taller.contacto },
	});

	return taller;
}

/**
 * Archive, not delete. A partner shop that has held vehicles is part of the service history, and
 * `nota_transferencia.tallerId` is `onDelete: Restrict` precisely so that history cannot vanish.
 */
export async function setTallerArchivado(input: { actor: Actor; id: string; archivado: boolean }) {
	if (!can(input.actor.role, "taller:manage")) throw new ClienteError(403, "Sin permiso: taller:manage");

	const current = await getTaller(input.id);
	if ((current.archivedAt !== null) === input.archivado) {
		throw new ClienteError(409, input.archivado ? "Ya está archivado." : "No está archivado.");
	}

	if (input.archivado) {
		const abiertas = await prisma.nota_servicio.count({
			where: { tallerActualId: current.id, estado: "en_taller" },
		});
		if (abiertas > 0) {
			throw new ClienteError(
				409,
				`No se puede archivar: ${abiertas} unidad(es) siguen en ese taller. Regrésalas primero.`,
			);
		}
	}

	const taller = await prisma.taller.update({
		where: { id: current.id },
		data: { archivedAt: input.archivado ? new Date() : null },
	});

	await recordAudit(prisma, {
		action: "taller.archive",
		actor: input.actor,
		entityId: taller.id,
		entityLabel: taller.nombre,
		summary: `${taller.nombre} ${input.archivado ? "archivado" : "reactivado"}`,
		before: { archivado: current.archivedAt !== null },
		after: { archivado: input.archivado },
	});

	return taller;
}

// ================================================================================================
// Solicitud pública de certificación
// ================================================================================================

/**
 * A workshop applies from the public /talleres page. **Anonymous, gated by Turnstile only** —
 * the same shape as `solicitarCita`, and for the same reason: requiring an account to ask for one
 * is a closed door.
 *
 * The row is built field by field from a whitelist and `estado`/`origen`/`revisado*` are FORCED,
 * whatever the body says. Never spread a request body here: an `{ estado: "aprobado" }` in the
 * payload would certify the applicant itself.
 */
export async function solicitarTaller(input: {
	body: Record<string, unknown>;
	turnstileToken: unknown;
	ip?: string | null;
}) {
	const verificacion = await verifyTurnstile(input.turnstileToken, input.ip);
	if (!verificacion.ok) throw new ClienteError(verificacion.status, verificacion.message);

	const datos = leerTallerInput(input.body);
	if (!datos.telefono) throw new ClienteError(400, "Necesitamos un teléfono para poder llamarte.");
	if (!datos.contacto) throw new ClienteError(400, "Dinos con quién hablamos.");
	if (!datos.especialidades) throw new ClienteError(400, "Cuéntanos qué trabajos hacen.");

	// One live application per phone. A double-submit is a duplicate somebody has to notice and
	// merge by hand, which is exactly the kind of chore that never gets done.
	const yaExiste = await prisma.taller.findFirst({
		where: { telefono: datos.telefono, estado: { in: ["solicitado", "aprobado"] }, archivedAt: null },
		select: { id: true, estado: true },
	});
	if (yaExiste) {
		throw new ClienteError(
			409,
			yaExiste.estado === "aprobado"
				? "Ese teléfono ya pertenece a un taller certificado. Llámanos y lo revisamos contigo."
				: "Ya tenemos tu solicitud y la estamos revisando. Te contactamos pronto.",
		);
	}

	const taller = await prisma.$transaction(async (tx) => {
		const creado = await tx.taller.create({
			data: {
				id: randomUUID(),
				...datos,
				// Forced, never read from the body.
				origen: "publico",
				estado: "solicitado",
				revisadoPorId: null,
				revisadoAt: null,
				revisionMotivo: null,
			},
		});

		// The head office, from what they just typed. Extra branches are added after approval.
		await tx.taller_sucursal.create({
			data: {
				id: randomUUID(),
				tallerId: creado.id,
				nombre: "Matriz",
				direccion: datos.direccion,
				ciudad: datos.ciudad,
				telefono: datos.telefono,
				contactoNombre: datos.contacto,
				contactoTelefono: datos.telefono,
				contactoEmail: datos.email,
				esPrincipal: true,
			},
		});

		await recordAudit(tx, {
			action: "taller.solicitud",
			// No user behind an anonymous form; the channel is named instead. Same as cita.solicitud.
			actor: { id: null, email: "publico@talleres" },
			entityId: creado.id,
			entityLabel: creado.nombre,
			summary: `Solicitud de certificación: ${creado.nombre}`,
			after: { nombre: creado.nombre, ciudad: creado.ciudad, especialidades: creado.especialidades },
		});

		return creado;
	});

	await notificar({
		evento: "taller_solicitud",
		destino: { difusion: true },
		titulo: "Un taller quiere certificarse",
		cuerpo: `${taller.nombre}${taller.ciudad ? ` · ${taller.ciudad}` : ""} — ${taller.especialidades}`,
		url: `/panel/talleres?estado=solicitado`,
		entidad: "taller",
		entidadId: taller.id,
	});

	// Only what the applicant already knows. No id, so the response cannot be used to read back
	// or enumerate anybody else's application.
	return { nombre: taller.nombre, estado: taller.estado };
}

/**
 * Approve or reject an application — `taller:review`.
 *
 * Approving is what makes a shop eligible to receive a vehicle at all; `transferirNota` refuses
 * anything that is not `aprobado`. Rejecting requires a reason, enforced here and again by
 * `taller_rechazo_motivo_check` in the database.
 */
export async function revisarTaller(input: { actor: Actor; id: string; estado: string; motivo?: unknown }) {
	if (!can(input.actor.role, "taller:review")) throw new ClienteError(403, "Sin permiso: taller:review");
	if (!isTallerEstado(input.estado) || input.estado === "solicitado") {
		throw new ClienteError(400, "Decide aprobado o rechazado.");
	}

	const actual = await getTaller(input.id);
	if (actual.estado === input.estado) {
		throw new ClienteError(409, `Ese taller ya está marcado como ${tallerEstadoLabel(input.estado)}.`);
	}

	const motivo = trim(input.motivo, 500, "El motivo");
	if (input.estado === "rechazado" && !motivo) {
		throw new ClienteError(400, "Un rechazo tiene que decir por qué. Es lo que se le explica al taller.");
	}

	// A shop holding one of our vehicles cannot be un-certified out from under it.
	if (input.estado === "rechazado") {
		const abiertas = await prisma.nota_servicio.count({
			where: { tallerActualId: actual.id, estado: "en_taller" },
		});
		if (abiertas > 0) {
			throw new ClienteError(
				409,
				`No puedes rechazarlo: tiene ${abiertas} unidad(es) nuestras. Recíbelas primero.`,
			);
		}
	}

	const taller = await prisma.$transaction(async (tx) => {
		const guardado = await tx.taller.update({
			where: { id: actual.id },
			data: {
				estado: input.estado,
				revisadoPorId: input.actor.id,
				revisadoAt: new Date(),
				revisionMotivo: motivo,
			},
		});

		await recordAudit(tx, {
			action: input.estado === "aprobado" ? "taller.approve" : "taller.reject",
			actor: input.actor,
			entityId: guardado.id,
			entityLabel: guardado.nombre,
			summary:
				input.estado === "aprobado"
					? `Certificó a ${guardado.nombre} como taller aliado`
					: `Rechazó a ${guardado.nombre}: ${motivo}`,
			before: { estado: actual.estado },
			after: { estado: guardado.estado, motivo },
		});

		return guardado;
	});

	return publicTaller({ ...taller, _count: { notas_recibidas: 0 } });
}

// ================================================================================================
// Sucursales
// ================================================================================================

function leerSucursalInput(body: Record<string, unknown>) {
	const nombre = trim(body.nombre, 160, "El nombre de la sucursal");
	if (!nombre) throw new ClienteError(400, "La sucursal necesita un nombre");

	return {
		nombre,
		direccion: trim(body.direccion, 500, "La dirección"),
		ciudad: trim(body.ciudad, 80, "La ciudad"),
		telefono: trim(body.telefono, 32, "El teléfono"),
		contactoNombre: trim(body.contactoNombre, 120, "El nombre del contacto"),
		contactoPuesto: trim(body.contactoPuesto, 80, "El puesto del contacto"),
		contactoTelefono: trim(body.contactoTelefono, 32, "El teléfono del contacto"),
		contactoEmail: trim(body.contactoEmail, 255, "El correo del contacto"),
	};
}

/**
 * Demote whatever branch is currently the head office.
 *
 * `taller_sucursal_principal_unica` is a partial UNIQUE index, so promoting a second one without
 * this fails the write instead of quietly ending up with two. Runs inside the caller's
 * transaction so there is never an instant with two head offices.
 */
async function despromoverPrincipal(tx: Prisma.TransactionClient, tallerId: string, excepto?: string) {
	await tx.taller_sucursal.updateMany({
		where: { tallerId, esPrincipal: true, archivedAt: null, ...(excepto ? { id: { not: excepto } } : {}) },
		data: { esPrincipal: false },
	});
}

export async function createSucursal(input: { actor: Actor; tallerId: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "taller:manage")) throw new ClienteError(403, "Sin permiso: taller:manage");

	const taller = await getTaller(input.tallerId);
	const data = leerSucursalInput(input.body);
	const esPrincipal = input.body.esPrincipal === true || input.body.esPrincipal === "on";

	const sucursal = await prisma.$transaction(async (tx) => {
		if (esPrincipal) await despromoverPrincipal(tx, taller.id);

		const creada = await tx.taller_sucursal.create({
			data: { id: randomUUID(), tallerId: taller.id, ...data, esPrincipal },
		});

		await recordAudit(tx, {
			action: "sucursal.create",
			actor: input.actor,
			entityId: creada.id,
			entityLabel: `${taller.nombre} · ${creada.nombre}`,
			summary: `Sucursal agregada a ${taller.nombre}: ${creada.nombre}`,
			after: { nombre: creada.nombre, ciudad: creada.ciudad, contacto: creada.contactoNombre },
		});

		return creada;
	});

	return publicSucursal(sucursal);
}

export async function updateSucursal(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "taller:manage")) throw new ClienteError(403, "Sin permiso: taller:manage");

	const actual = await prisma.taller_sucursal.findUnique({
		where: { id: input.id },
		include: { taller: { select: { nombre: true } } },
	});
	if (!actual) throw new ClienteError(404, "Sucursal no encontrada");

	const data = leerSucursalInput({
		nombre: actual.nombre,
		direccion: actual.direccion,
		ciudad: actual.ciudad,
		telefono: actual.telefono,
		contactoNombre: actual.contactoNombre,
		contactoPuesto: actual.contactoPuesto,
		contactoTelefono: actual.contactoTelefono,
		contactoEmail: actual.contactoEmail,
		...input.body,
	});
	const esPrincipal =
		input.body.esPrincipal === undefined
			? actual.esPrincipal
			: input.body.esPrincipal === true || input.body.esPrincipal === "on";

	const sucursal = await prisma.$transaction(async (tx) => {
		if (esPrincipal && !actual.esPrincipal) await despromoverPrincipal(tx, actual.tallerId, actual.id);

		const guardada = await tx.taller_sucursal.update({
			where: { id: actual.id },
			data: { ...data, esPrincipal },
		});

		await recordAudit(tx, {
			action: "sucursal.update",
			actor: input.actor,
			entityId: guardada.id,
			entityLabel: `${actual.taller.nombre} · ${guardada.nombre}`,
			summary: `Sucursal actualizada: ${guardada.nombre}`,
			before: { nombre: actual.nombre, contacto: actual.contactoNombre, esPrincipal: actual.esPrincipal },
			after: { nombre: guardada.nombre, contacto: guardada.contactoNombre, esPrincipal: guardada.esPrincipal },
		});

		return guardada;
	});

	return publicSucursal(sucursal);
}

/** Archive, never delete: a branch that held a vehicle is part of where that vehicle has been. */
export async function archivarSucursal(input: { actor: Actor; id: string; archivado: boolean }) {
	if (!can(input.actor.role, "taller:manage")) throw new ClienteError(403, "Sin permiso: taller:manage");

	const actual = await prisma.taller_sucursal.findUnique({
		where: { id: input.id },
		include: { taller: { select: { nombre: true } } },
	});
	if (!actual) throw new ClienteError(404, "Sucursal no encontrada");
	if ((actual.archivedAt !== null) === input.archivado) {
		throw new ClienteError(409, input.archivado ? "Ya está archivada." : "No está archivada.");
	}

	const sucursal = await prisma.$transaction(async (tx) => {
		const guardada = await tx.taller_sucursal.update({
			where: { id: actual.id },
			data: {
				archivedAt: input.archivado ? new Date() : null,
				// Archiving the head office leaves the shop without one rather than silently
				// promoting another branch — which one is a decision, not a default.
				...(input.archivado ? { esPrincipal: false } : {}),
			},
		});

		await recordAudit(tx, {
			action: "sucursal.archive",
			actor: input.actor,
			entityId: guardada.id,
			entityLabel: `${actual.taller.nombre} · ${guardada.nombre}`,
			summary: `Sucursal ${input.archivado ? "archivada" : "reactivada"}: ${guardada.nombre}`,
			before: { archivada: actual.archivedAt !== null },
			after: { archivada: input.archivado },
		});

		return guardada;
	});

	return publicSucursal(sucursal);
}

/**
 * Does this text name one of our partner workshops?
 *
 * Lives here rather than in `notas.ts` because BOTH customer-facing surfaces need it: a comment
 * marked visible, and a quote line — the customer reads the quote too, so a line item that names
 * the partner shop leaks exactly what the invisibility rule exists to prevent.
 *
 * KILL SWITCH (2026-09-01): false-positive on "negro" (matched a real active taller's name) was
 * blocking legitimate customer comments. Disabled by always returning null — never blocks — until
 * the underlying false-positive is fixed properly. Detection logic kept below, commented out, for
 * the re-enable path: uncomment the body and delete the early `return null`. See
 * docs/permissions.md "El taller aliado es invisible para el cliente" for why this guard exists.
 */
export async function tallerMencionado(_texto: string): Promise<string | null> {
	return null;
	/*
	const talleres = await prisma.taller.findMany({
		// `esInterno: false` — our OWN bay is not a name to hide. The rule exists so a customer
		// cannot go straight to the partner that did the work next time; "lo estamos haciendo aquí
		// en Estación 360" is the opposite of that, and blocking it would make the shop unable to
		// say where the car is.
		where: { archivedAt: null, esInterno: false },
		select: { nombre: true },
	});
	return nombreMencionado(
		_texto,
		talleres.map((t) => t.nombre),
	);
	*/
}

// --- Su gente --------------------------------------------------------------------------------

/**
 * The people who work AT a partner workshop, with accounts of their own.
 *
 * Kept here rather than in `users.ts` because the question is "who is this shop's crew", and the
 * answer is read on the taller screen. `listUsers` stays the registry of everybody.
 */
export async function mecanicosDeTaller(tallerId: string) {
	const filas = await prisma.user.findMany({
		where: { tallerId },
		orderBy: { name: "asc" },
		select: { id: true, name: true, email: true, banned: true },
	});
	return filas.map((u) => ({ id: u.id, name: u.name, email: u.email, active: !u.banned }));
}

/** Mechanics with no workshop of their own — the candidates a taller can take on. */
export async function mecanicosSinTaller() {
	const filas = await prisma.user.findMany({
		where: { role: "taller", tallerId: null, OR: [{ banned: null }, { banned: false }] },
		orderBy: { name: "asc" },
		select: { id: true, name: true, email: true },
	});
	return filas;
}

/**
 * Put a mechanic on a partner workshop's crew, or take them off it (`tallerId: null`).
 *
 * **Only a Taller Mecánico may belong to a workshop.** An Operador or Gerente carrying one would
 * be an account with the counter's permissions AND an outside shop's scope — so the role is
 * checked here and again by `user_taller_solo_rol_taller_check` in the database, because this
 * decides how much of a job somebody outside the company can open.
 *
 * `taller:manage` and not `user:manage`: this is a commercial decision about a supplier's crew,
 * taken on the supplier's screen, and it grants no permission the account did not already have —
 * it only changes WHICH notes are in scope.
 */
export async function asignarMecanicoATaller(input: { actor: Actor; userId: unknown; tallerId: unknown }) {
	if (!can(input.actor.role, "taller:manage")) throw new ClienteError(403, "Sin permiso: taller:manage");

	const userId = trim(input.userId);
	if (!userId) throw new ClienteError(400, "Falta el usuario");
	const tallerId = trim(input.tallerId);

	const usuario = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, name: true, email: true, role: true, tallerId: true },
	});
	if (!usuario) throw new ClienteError(404, "Usuario no encontrado");
	if (usuario.role !== "taller") {
		throw new ClienteError(
			400,
			`${usuario.name} no es Taller Mecánico. Solo ese rol puede pertenecer a un taller aliado.`,
		);
	}

	let nombreTaller: string | null = null;
	if (tallerId) {
		const taller = await prisma.taller.findUnique({
			where: { id: tallerId },
			select: { nombre: true, estado: true, archivedAt: true },
		});
		if (!taller) throw new ClienteError(404, "Taller no encontrado");
		if (taller.archivedAt) throw new ClienteError(409, "Ese taller está archivado.");
		// The same gate `transferirNota` uses: a shop that merely applied never holds a customer's
		// vehicle, so its people have no job to open either.
		if (taller.estado !== TALLER_PUEDE_RECIBIR) {
			throw new ClienteError(409, `${taller.nombre} todavía no está certificado como taller aliado.`);
		}
		nombreTaller = taller.nombre;
	}

	return prisma.$transaction(async (tx) => {
		const actualizado = await tx.user.update({
			where: { id: usuario.id },
			data: { tallerId },
			select: { id: true, name: true, email: true, tallerId: true },
		});

		// `tallerId` rides on the session, so an account that was already logged in would keep the
		// scope it had — either blind to their new shop's work, or still seeing the old shop's
		// after being removed from it. The second half is the one that matters: taking somebody OFF
		// a crew has to take effect now, not whenever their cookie happens to expire.
		//
		// Same treatment a lockout gets, and the same reason: cut the open sessions instead of
		// waiting them out. They sign in again and get the right scope.
		await tx.session.deleteMany({ where: { userId: usuario.id } });

		await recordAudit(tx, {
			action: "taller.mecanico",
			actor: input.actor,
			entityId: usuario.id,
			entityLabel: usuario.email,
			summary: tallerId
				? `${usuario.name} asignado al taller ${nombreTaller} (se cerraron sus sesiones)`
				: `${usuario.name} desligado de su taller aliado (se cerraron sus sesiones)`,
			before: { tallerId: usuario.tallerId },
			after: { tallerId, taller: nombreTaller },
		});

		return actualizado;
	});
}
