import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import {
	DURACION_MINUTOS,
	FRANJAS,
	citaEstadoLabel,
	citaTipoLabel,
	isCitaEstado,
	isCitaTipo,
	isFranja,
	puedeTransicionar,
	requiereHora,
	type CitaEstado,
	type CitaTipo,
} from "$lib/citas";
import {
	acomodar,
	enZona,
	fechaEnZona,
	hoy,
	parseFecha,
	rangoVista,
	semanaDe,
	type Vista,
} from "$lib/agenda";
import { recordAudit } from "./audit";
import { ClienteError, createCliente, getCliente, trim } from "./clientes";
import { createUnidad } from "./unidades";
import { pageMeta, parsePageParams, skipFor, type PageParams } from "./paginate";
import { verifyTurnstile } from "./turnstile";
import type { Actor } from "./guard";

/** Reuses ClienteError so every route in the app maps `.status` the same way. */
export { ClienteError as CitaError };

/** The audit actor for a booking nobody signed in to make. */
const ACTOR_PUBLICO = { id: null, email: "publico@formulario" };

const int = (v: unknown): number | null => {
	if (v === undefined || v === null || v === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? Math.trunc(n) : null;
};

/** How an appointment is named in lists, drawers and the audit trail. */
export const citaLabel = (c: {
	folio: number;
	nombre: string;
	marca: string | null;
	modelo: string | null;
}) => [`#${c.folio}`, c.nombre, [c.marca, c.modelo].filter(Boolean).join(" ")].filter(Boolean).join(" · ");

type CitaRow = {
	id: string;
	folio: number;
	origen: string;
	estado: string;
	tipo: string;
	fecha: Date;
	franja: string | null;
	inicio: Date | null;
	fin: Date | null;
	nombre: string;
	telefono: string;
	email: string | null;
	marca: string | null;
	modelo: string | null;
	anio: number | null;
	placas: string | null;
	motivo: string;
	notas: string | null;
	clienteId: string | null;
	unidadId: string | null;
	direccionRecoleccion: string | null;
	asignadoId: string | null;
	entregadorId: string | null;
	canceladoMotivo: string | null;
	createdAt: Date;
	cliente?: { nombreCompleto: string; tipo: string } | null;
	unidad?: { marca: string; modelo: string; placas: string | null } | null;
	asignado?: { name: string; email: string; role: string | null } | null;
	entregador?: { nombre: string; telefono: string | null; roles: string[] } | null;
};

/** Shape returned by the API. Explicit mapper — never spread a Prisma row (Rule 4). */
export const publicCita = (c: CitaRow) => ({
	id: c.id,
	folio: c.folio,
	origen: c.origen,
	estado: c.estado,
	estadoLabel: citaEstadoLabel(c.estado),
	tipo: c.tipo,
	tipoLabel: citaTipoLabel(c.tipo),
	// The date is a calendar day, not an instant — send it as one so no timezone can shift it.
	fecha: c.fecha.toISOString().slice(0, 10),
	franja: c.franja,
	inicio: c.inicio?.toISOString() ?? null,
	fin: c.fin?.toISOString() ?? null,
	nombre: c.nombre,
	telefono: c.telefono,
	email: c.email,
	marca: c.marca,
	modelo: c.modelo,
	anio: c.anio,
	placas: c.placas,
	motivo: c.motivo,
	notas: c.notas,
	clienteId: c.clienteId,
	clienteNombre: c.cliente?.nombreCompleto ?? null,
	// A persona can sign for their own unit; an organización cannot, so it needs a named
	// entregador. The detail screen says which case this is.
	clienteTipo: c.cliente?.tipo ?? null,
	unidadId: c.unidadId,
	unidadEtiqueta: c.unidad
		? [`${c.unidad.marca} ${c.unidad.modelo}`, c.unidad.placas].filter(Boolean).join(" · ")
		: null,
	direccionRecoleccion: c.direccionRecoleccion,
	asignadoId: c.asignadoId,
	asignadoNombre: c.asignado?.name ?? null,
	asignadoRol: c.asignado?.role ?? null,
	entregadorId: c.entregadorId,
	entregadorNombre: c.entregador?.nombre ?? null,
	entregadorTelefono: c.entregador?.telefono ?? null,
	canceladoMotivo: c.canceladoMotivo,
	etiqueta: citaLabel(c),
	// A confirmable appointment needs a real customer and a real vehicle on file.
	vinculada: c.clienteId !== null && c.unidadId !== null,
	createdAt: c.createdAt.toISOString(),
});

export type CitaPublica = ReturnType<typeof publicCita>;

const INCLUDE = {
	cliente: { select: { nombreCompleto: true, tipo: true } },
	unidad: { select: { marca: true, modelo: true, placas: true } },
	asignado: { select: { name: true, email: true, role: true } },
	entregador: { select: { nombre: true, telefono: true, roles: true } },
} satisfies Prisma.citaInclude;

// --- Reading ---------------------------------------------------------------------------------

export type CitaQuery = {
	desde?: string | null;
	hasta?: string | null;
	estado?: string | null;
	tipo?: string | null;
	asignadoId?: string | null;
	clienteId?: string | null;
	q?: string | null;
} & Partial<PageParams>;

/**
 * `mias=1` is resolved against the CALLER, never against an id in the URL — otherwise it would
 * just be `asignadoId` with extra steps, and anyone could read "mine" as somebody else.
 */
export function parseCitaQuery(params: URLSearchParams, actorId?: string): CitaQuery {
	return {
		desde: params.get("desde"),
		hasta: params.get("hasta"),
		estado: params.get("estado"),
		tipo: params.get("tipo"),
		asignadoId: params.get("mias") === "1" && actorId ? actorId : params.get("asignadoId"),
		clienteId: params.get("clienteId"),
		q: params.get("q"),
		...parsePageParams(params),
	};
}

function whereFor(query: CitaQuery): Prisma.citaWhereInput {
	const desde = parseFecha(query.desde);
	const hasta = parseFecha(query.hasta);
	const folio = query.q ? Number(query.q.replace("#", "")) : NaN;

	return {
		...(desde || hasta
			? {
					fecha: {
						...(desde ? { gte: enZona(desde) } : {}),
						...(hasta ? { lte: enZona(hasta) } : {}),
					},
				}
			: {}),
		...(isCitaEstado(query.estado) ? { estado: query.estado } : {}),
		...(isCitaTipo(query.tipo) ? { tipo: query.tipo } : {}),
		...(query.asignadoId ? { asignadoId: query.asignadoId } : {}),
		...(query.clienteId ? { clienteId: query.clienteId } : {}),
		...(query.q
			? {
					OR: [
						...(Number.isInteger(folio) ? [{ folio }] : []),
						{ nombre: { contains: query.q, mode: "insensitive" as const } },
						{ telefono: { contains: query.q } },
						{ placas: { contains: query.q, mode: "insensitive" as const } },
						{ motivo: { contains: query.q, mode: "insensitive" as const } },
					],
				}
			: {}),
	};
}

export async function listCitas(query: CitaQuery) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 25 };
	const where = whereFor(query);

	const [total, rows] = await Promise.all([
		prisma.cita.count({ where }),
		prisma.cita.findMany({
			where,
			// Unscheduled requests sort with their day, ahead of the hours that were granted.
			orderBy: [{ fecha: "asc" }, { inicio: "asc" }, { folio: "asc" }],
			skip: skipFor(paging),
			take: paging.perPage,
			include: INCLUDE,
		}),
	]);

	return { citas: rows.map(publicCita), ...pageMeta(total, paging) };
}

export async function getCita(id: string) {
	const cita = await prisma.cita.findUnique({ where: { id }, include: INCLUDE });
	if (!cita) throw new ClienteError(404, "Cita no encontrada");
	return cita;
}

/**
 * One query per calendar screen, already laid out.
 *
 * Appointments with an hour are placed on the time grid, overlaps side by side. Requests with no
 * hour yet go to a per-day `sinHora` strip — which is exactly the visual cue that somebody still
 * has to confirm them.
 */
export async function agenda(vista: Vista, fecha: string, asignadoId?: string | null) {
	const { desde, hasta } = rangoVista(vista, fecha);
	const dias = vista === "dia" ? [fecha] : semanaDe(fecha);

	const rows = await prisma.cita.findMany({
		where: {
			fecha: { gte: enZona(desde), lte: enZona(hasta) },
			estado: { not: "cancelada" },
			...(asignadoId ? { asignadoId } : {}),
		},
		orderBy: [{ inicio: "asc" }, { folio: "asc" }],
		include: INCLUDE,
	});

	const citas = rows.map(publicCita);

	return {
		vista,
		fecha,
		desde,
		hasta,
		dias: dias.map((dia) => {
			const delDia = citas.filter((c) => c.fecha === dia);
			const conHora = delDia.filter((c) => c.inicio && c.fin);
			return {
				fecha: dia,
				sinHora: delDia.filter((c) => !c.inicio || !c.fin),
				bloques: acomodar(
					conHora.map((c) => ({ cita: c, inicio: new Date(c.inicio!), fin: new Date(c.fin!) })),
				),
			};
		}),
	};
}

/**
 * One user's appointment numbers over a period. Caller MUST have checked `user:stats`.
 *
 * Counts what was ASSIGNED to them, by estado, plus how many of those were pickups — the thing
 * an Operador actually gets sent out to do. `desde`/`hasta` are shop-local calendar days.
 */
export async function estadisticasUsuario(userId: string, desde: string, hasta: string) {
	const rango = { gte: enZona(desde), lte: enZona(hasta) };
	const asignadas = { asignadoId: userId, fecha: rango };

	const [porEstado, total, recolecciones, proximas] = await Promise.all([
		prisma.cita.groupBy({ by: ["estado"], where: asignadas, _count: true }),
		prisma.cita.count({ where: asignadas }),
		prisma.cita.count({ where: { ...asignadas, tipo: "recoleccion" } }),
		prisma.cita.findMany({
			where: { asignadoId: userId, fecha: { gte: enZona(hoy()) }, estado: { notIn: ["cancelada", "completada"] } },
			orderBy: [{ fecha: "asc" }, { inicio: "asc" }],
			take: 10,
			include: INCLUDE,
		}),
	]);

	const cuenta = (estado: CitaEstado) => porEstado.find((g) => g.estado === estado)?._count ?? 0;
	const completadas = cuenta("completada");
	const noAsistio = cuenta("no_asistio");
	// Of the appointments that actually reached an outcome — the rest are still in flight, and
	// counting them as failures would punish somebody for having work scheduled.
	const resueltas = completadas + noAsistio + cuenta("cancelada");

	return {
		desde,
		hasta,
		total,
		recolecciones,
		completadas,
		noAsistio,
		enProceso: cuenta("en_proceso"),
		confirmadas: cuenta("confirmada"),
		canceladas: cuenta("cancelada"),
		cumplimiento: resueltas === 0 ? null : Math.round((completadas / resueltas) * 100),
		proximas: proximas.map(publicCita),
	};
}

/** The dashboard counters. Three cheap counts, one round trip. */
export async function resumenAgenda() {
	const dia = hoy();
	const inicioDia = enZona(dia);

	const [citasHoy, solicitudes, recoleccionesHoy] = await Promise.all([
		prisma.cita.count({ where: { fecha: inicioDia, estado: { notIn: ["cancelada"] } } }),
		prisma.cita.count({ where: { estado: "solicitada" } }),
		prisma.cita.count({
			where: { fecha: inicioDia, tipo: "recoleccion", estado: { notIn: ["cancelada", "completada"] } },
		}),
	]);

	return { hoy: dia, citasHoy, solicitudes, recoleccionesHoy };
}

// --- Writing ---------------------------------------------------------------------------------

/** The fields both entry points share. Never spread a request body into the write. */
function leerDatosContacto(body: Record<string, unknown>) {
	const nombre = trim(body.nombre, 120, "El nombre");
	if (!nombre) throw new ClienteError(400, "El nombre es obligatorio");

	const telefono = trim(body.telefono, 32, "El teléfono");
	if (!telefono) throw new ClienteError(400, "El teléfono es obligatorio");

	const motivo = trim(body.motivo, 2000, "El motivo");
	if (!motivo) throw new ClienteError(400, "Cuéntanos qué necesita la unidad");

	const anio = int(body.anio);
	if (anio !== null && (anio < 1900 || anio > new Date().getFullYear() + 2)) {
		throw new ClienteError(400, "Año fuera de rango");
	}

	return {
		nombre,
		telefono,
		email: trim(body.email, 255, "El correo"),
		marca: trim(body.marca, 60, "La marca"),
		modelo: trim(body.modelo, 60, "El modelo"),
		anio,
		placas: trim(body.placas, 16, "Las placas")?.toUpperCase() ?? null,
		motivo,
	};
}

/** `tipo` plus the address a pickup cannot exist without — mirrors the CHECK constraint. */
function leerTipo(body: Record<string, unknown>) {
	const tipo = body.tipo;
	if (!isCitaTipo(tipo)) throw new ClienteError(400, "Elige si traes la unidad o si vamos por ella");

	const direccionRecoleccion = trim(body.direccionRecoleccion, 500, "La dirección");
	if (tipo === "recoleccion" && !direccionRecoleccion) {
		throw new ClienteError(400, "Necesitamos la dirección donde recogemos la unidad");
	}

	return { tipo: tipo as CitaTipo, direccionRecoleccion: tipo === "recoleccion" ? direccionRecoleccion : null };
}

function leerFecha(value: unknown, { futuro = false } = {}): string {
	const fecha = parseFecha(value);
	if (!fecha) throw new ClienteError(400, "Fecha inválida");
	if (futuro && fecha < hoy()) throw new ClienteError(400, "Esa fecha ya pasó");
	return fecha;
}

/** An instant from the client, validated. Accepts `YYYY-MM-DDTHH:MM` or a full ISO string. */
function leerInstante(value: unknown, campo: string): Date {
	if (typeof value !== "string" || value === "") throw new ClienteError(400, `${campo} es obligatorio`);
	// A bare `YYYY-MM-DDTHH:MM` from an <input type="datetime-local"> has no zone: it is shop
	// wall-clock time, so pin it to the shop's offset instead of the server's.
	const d = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
		? enZona(value.slice(0, 10), value.slice(11, 16))
		: new Date(value);
	if (Number.isNaN(d.getTime())) throw new ClienteError(400, `${campo} inválida`);
	return d;
}

const finPorDefecto = (inicio: Date) => new Date(inicio.getTime() + DURACION_MINUTOS * 60_000);

/**
 * THE ANONYMOUS PATH. Called only by POST /api/citas/solicitudes and the /citas form action.
 *
 * Turnstile is its only gate, so every field is taken from a whitelist and the invariants are
 * forced here rather than trusted: a public submission can never arrive already confirmed, never
 * name a cliente/unidad/assignee, never carry internal notes, and never grant itself an hour.
 */
export async function solicitarCita(input: {
	body: Record<string, unknown>;
	turnstileToken: unknown;
	ip?: string | null;
}) {
	const verificacion = await verifyTurnstile(input.turnstileToken, input.ip);
	if (!verificacion.ok) throw new ClienteError(verificacion.status, verificacion.message);

	const contacto = leerDatosContacto(input.body);
	const { tipo, direccionRecoleccion } = leerTipo(input.body);
	const fecha = leerFecha(input.body.fecha, { futuro: true });

	const franja = input.body.franja;
	if (!isFranja(franja)) throw new ClienteError(400, "Elige si prefieres mañana o tarde");

	const cita = await prisma.cita.create({
		data: {
			id: randomUUID(),
			...contacto,
			tipo,
			direccionRecoleccion,
			fecha: enZona(fecha),
			franja,
			// Forced, not read from the body — the whole point of this function.
			origen: "publico",
			estado: "solicitada",
			inicio: null,
			fin: null,
			notas: null,
			clienteId: null,
			unidadId: null,
			asignadoId: null,
		},
		include: INCLUDE,
	});

	await recordAudit(prisma, {
		action: "cita.solicitud",
		actor: ACTOR_PUBLICO,
		entityId: cita.id,
		entityLabel: citaLabel(cita),
		summary: `Cita solicitada por ${cita.nombre} para el ${fecha} (${FRANJAS[franja].label})`,
		after: { fecha, franja, tipo, telefono: cita.telefono },
	});

	return cita;
}

/** The counter path. Staff book an exact hour, so `inicio` is required. */
export async function crearCita(input: { actor: Actor; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cita:create")) throw new ClienteError(403, "Sin permiso: cita:create");

	const contacto = leerDatosContacto(input.body);
	const { tipo, direccionRecoleccion } = leerTipo(input.body);
	const inicio = leerInstante(input.body.inicio, "La hora de inicio");
	const fin = input.body.fin ? leerInstante(input.body.fin, "La hora de fin") : finPorDefecto(inicio);
	if (fin <= inicio) throw new ClienteError(400, "La hora de fin debe ser posterior al inicio");

	const { clienteId, unidadId } = await resolverVinculos(input.body);
	const asignadoId = await resolverAsignado(input.actor, input.body.asignadoId, { alCrear: true });

	const cita = await prisma.cita.create({
		data: {
			id: randomUUID(),
			...contacto,
			tipo,
			direccionRecoleccion,
			origen: "panel",
			estado: "confirmada",
			fecha: enZona(fechaEnZona(inicio)),
			franja: null,
			inicio,
			fin,
			notas: trim(input.body.notas),
			clienteId,
			unidadId,
			asignadoId,
		},
		include: INCLUDE,
	});

	await recordAudit(prisma, {
		action: "cita.create",
		actor: input.actor,
		entityId: cita.id,
		entityLabel: citaLabel(cita),
		summary: `Cita creada para ${cita.nombre} el ${cita.fecha.toISOString().slice(0, 10)}`,
		after: { inicio: inicio.toISOString(), fin: fin.toISOString(), tipo, asignadoId },
	});

	return cita;
}

/** Customer / unit links, validated: a unit must belong to the customer it is filed under. */
async function resolverVinculos(body: Record<string, unknown>) {
	const clienteId = trim(body.clienteId);
	const unidadId = trim(body.unidadId);

	if (clienteId) {
		const existe = await prisma.cliente.count({ where: { id: clienteId } });
		if (!existe) throw new ClienteError(404, "Cliente no encontrado");
	}
	if (unidadId) {
		const unidad = await prisma.unidad.findUnique({ where: { id: unidadId }, select: { clienteId: true } });
		if (!unidad) throw new ClienteError(404, "Unidad no encontrada");
		if (clienteId && unidad.clienteId !== clienteId) {
			throw new ClienteError(400, "Esa unidad no pertenece al cliente seleccionado");
		}
	}
	return { clienteId, unidadId };
}

/**
 * Naming who handles the pickup is `cita:assign`, even when it happens during creation —
 * otherwise an Operador could assign work by booking rather than by reassigning.
 */
async function resolverAsignado(actor: Actor, value: unknown, { alCrear = false } = {}) {
	const asignadoId = trim(value);
	if (!asignadoId) return null;
	if (!can(actor.role, "cita:assign")) {
		throw new ClienteError(403, alCrear ? "Sin permiso para asignar la cita: cita:assign" : "Sin permiso: cita:assign");
	}
	const user = await prisma.user.findUnique({ where: { id: asignadoId }, select: { banned: true } });
	if (!user) throw new ClienteError(404, "Usuario no encontrado");
	if (user.banned) throw new ClienteError(409, "Ese usuario está bloqueado");
	return asignadoId;
}

export async function actualizarCita(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cita:update")) throw new ClienteError(403, "Sin permiso: cita:update");

	const current = await getCita(input.id);
	if (current.estado === "cancelada") {
		throw new ClienteError(409, "Una cita cancelada ya no se edita.");
	}

	const contacto = leerDatosContacto({ ...toBody(current), ...input.body });
	const { tipo, direccionRecoleccion } = leerTipo({ ...toBody(current), ...input.body });
	const { clienteId, unidadId } = await resolverVinculos({ ...toBody(current), ...input.body });

	// Rescheduling is optional: an edit that only fixes a phone number keeps the slot.
	const inicio = input.body.inicio ? leerInstante(input.body.inicio, "La hora de inicio") : current.inicio;
	let fin = input.body.fin ? leerInstante(input.body.fin, "La hora de fin") : current.fin;

	// Moving the start with no new end MOVES the appointment — it does not stretch it backwards.
	// A two-hour job dragged to the afternoon is still two hours; keeping the old `fin` would
	// leave it before the new `inicio` and reject a perfectly ordinary reschedule.
	if (inicio && !input.body.fin) {
		const duracion = current.inicio && current.fin ? current.fin.getTime() - current.inicio.getTime() : null;
		fin = duracion ? new Date(inicio.getTime() + duracion) : finPorDefecto(inicio);
	}
	if (inicio && fin && fin <= inicio) throw new ClienteError(400, "La hora de fin debe ser posterior al inicio");
	if (!inicio && current.estado !== "solicitada") {
		throw new ClienteError(400, "Una cita confirmada necesita hora de inicio");
	}

	const fecha = inicio
		? enZona(fechaEnZona(inicio))
		: input.body.fecha
			? enZona(leerFecha(input.body.fecha))
			: current.fecha;

	const cita = await prisma.cita.update({
		where: { id: current.id },
		data: {
			...contacto,
			tipo,
			direccionRecoleccion,
			fecha,
			inicio,
			fin,
			clienteId,
			unidadId,
			notas: input.body.notas !== undefined ? trim(input.body.notas) : current.notas,
		},
		include: INCLUDE,
	});

	await recordAudit(prisma, {
		action: "cita.update",
		actor: input.actor,
		entityId: cita.id,
		entityLabel: citaLabel(cita),
		summary: `Cita #${cita.folio} actualizada`,
		before: {
			inicio: current.inicio?.toISOString() ?? null,
			tipo: current.tipo,
			telefono: current.telefono,
			clienteId: current.clienteId,
		},
		after: {
			inicio: cita.inicio?.toISOString() ?? null,
			tipo: cita.tipo,
			telefono: cita.telefono,
			clienteId: cita.clienteId,
		},
	});

	return cita;
}

/** The current row as a body, so a PATCH can carry only the fields it changes. */
const toBody = (c: CitaRow): Record<string, unknown> => ({
	nombre: c.nombre,
	telefono: c.telefono,
	email: c.email,
	marca: c.marca,
	modelo: c.modelo,
	anio: c.anio,
	placas: c.placas,
	motivo: c.motivo,
	tipo: c.tipo,
	direccionRecoleccion: c.direccionRecoleccion,
	clienteId: c.clienteId,
	unidadId: c.unidadId,
});

/**
 * Attach the appointment to a real customer, a real vehicle and — optionally — the person who
 * will hand the unit over. This is what `confirmarCita` requires to have happened.
 *
 * Either side can be an existing record or a new one created right here from what the customer
 * already typed on the form (`crearCliente: "1"` / `crearUnidad: "1"`). Making that one click is
 * the point: the counter should never have to leave the appointment, open Clientes, type the same
 * name again, come back and search for it.
 *
 * Creating goes through `createCliente` / `createUnidad`, so the customer registry's own rules and
 * audit entries apply — this does not write those tables directly.
 */
export async function vincularCita(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cita:update")) throw new ClienteError(403, "Sin permiso: cita:update");

	const current = await getCita(input.id);
	if (current.estado === "cancelada") throw new ClienteError(409, "Una cita cancelada ya no se edita.");

	let clienteId = trim(input.body.clienteId);

	if (input.body.crearCliente === "1" || input.body.crearCliente === "on") {
		const tipo = trim(input.body.tipoCliente) === "organizacion" ? "organizacion" : "persona";
		// Prefilled from the appointment, so the counter only corrects what is wrong.
		// The drawer offers ONE field for both cases ("Nombre / Razón social"), so an organización
		// accepts `nombre` as its razón social — otherwise typing a company name there would be
		// silently dropped and the record created under the caller's personal name instead.
		const cliente = await createCliente({
			actor: input.actor,
			body: {
				tipo,
				...(tipo === "persona"
					? { nombre: trim(input.body.nombre) ?? current.nombre, apellidos: trim(input.body.apellidos) }
					: { razonSocial: trim(input.body.razonSocial) ?? trim(input.body.nombre) ?? current.nombre }),
				telefono: trim(input.body.telefono) ?? current.telefono,
				email: trim(input.body.email) ?? current.email,
			},
		});
		clienteId = cliente.id;
	}

	if (!clienteId) throw new ClienteError(400, "Elige un cliente o crea uno nuevo");
	const cliente = await getCliente(clienteId);
	if (cliente.archivedAt) throw new ClienteError(409, "Ese cliente está archivado.");

	let unidadId = trim(input.body.unidadId);

	if (input.body.crearUnidad === "1" || input.body.crearUnidad === "on") {
		const unidad = await createUnidad({
			actor: input.actor,
			clienteId,
			body: {
				marca: trim(input.body.marca) ?? current.marca,
				modelo: trim(input.body.modelo) ?? current.modelo,
				anio: input.body.anio ?? current.anio,
				placas: trim(input.body.placas) ?? current.placas,
				vin: trim(input.body.vin),
			},
		});
		unidadId = unidad.id;
	}

	if (!unidadId) throw new ClienteError(400, "Elige una unidad o crea una nueva");
	const unidad = await prisma.unidad.findUnique({
		where: { id: unidadId },
		select: { clienteId: true, archivedAt: true },
	});
	if (!unidad) throw new ClienteError(404, "Unidad no encontrada");
	if (unidad.clienteId !== clienteId) {
		throw new ClienteError(400, "Esa unidad no pertenece al cliente seleccionado");
	}
	if (unidad.archivedAt) throw new ClienteError(409, "Esa unidad está archivada.");

	const entregadorId = await resolverEntregador(clienteId, input.body.entregadorId);

	const cita = await prisma.cita.update({
		where: { id: current.id },
		data: { clienteId, unidadId, entregadorId },
		include: INCLUDE,
	});

	await recordAudit(prisma, {
		action: "cita.link",
		actor: input.actor,
		entityId: cita.id,
		entityLabel: citaLabel(cita),
		summary: `Cita #${cita.folio} vinculada a ${cliente.nombreCompleto}`,
		before: { clienteId: current.clienteId, unidadId: current.unidadId, entregadorId: current.entregadorId },
		after: { clienteId, unidadId, entregadorId },
	});

	return cita;
}

/**
 * The handover person must be a contact OF THIS customer and must hold `entregador` — a foreign
 * key cannot say that, so it is checked here. Letting somebody else's contact through would mean
 * authorizing a stranger to drive a customer's vehicle away.
 */
async function resolverEntregador(clienteId: string, value: unknown): Promise<string | null> {
	const entregadorId = trim(value);
	if (!entregadorId) return null;

	const contacto = await prisma.cliente_contacto.findUnique({
		where: { id: entregadorId },
		select: { clienteId: true, roles: true, nombre: true, archivedAt: true },
	});
	if (!contacto) throw new ClienteError(404, "Contacto no encontrado");
	if (contacto.clienteId !== clienteId) {
		throw new ClienteError(400, "Ese contacto pertenece a otro cliente");
	}
	if (contacto.archivedAt) throw new ClienteError(409, "Ese contacto está archivado.");
	if (!contacto.roles.includes("entregador")) {
		throw new ClienteError(
			400,
			`${contacto.nombre} no tiene el rol de Entregador. Agrégaselo en la ficha del cliente.`,
		);
	}
	return entregadorId;
}

/**
 * Grant a requested appointment a real hour. `solicitada → confirmada`, which is the only
 * transition that also writes `inicio`.
 *
 * Requires a linked customer and vehicle: a confirmed appointment is a commitment to work on a
 * specific car for a specific person, and the work order that follows hangs off both.
 */
export async function confirmarCita(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cita:update")) throw new ClienteError(403, "Sin permiso: cita:update");

	const current = await getCita(input.id);
	if (!puedeTransicionar(current.estado, "confirmada")) {
		throw new ClienteError(409, `Una cita ${citaEstadoLabel(current.estado).toLowerCase()} ya no se confirma.`);
	}
	if (!current.clienteId || !current.unidadId) {
		throw new ClienteError(
			409,
			"Antes de confirmar, vincula la cita a un cliente y a una unidad.",
		);
	}

	const inicio = leerInstante(input.body.inicio, "La hora de inicio");
	const fin = input.body.fin ? leerInstante(input.body.fin, "La hora de fin") : finPorDefecto(inicio);
	if (fin <= inicio) throw new ClienteError(400, "La hora de fin debe ser posterior al inicio");

	const asignadoId =
		input.body.asignadoId !== undefined
			? await resolverAsignado(input.actor, input.body.asignadoId)
			: current.asignadoId;

	const cita = await prisma.cita.update({
		where: { id: current.id },
		data: {
			estado: "confirmada",
			inicio,
			fin,
			asignadoId,
			fecha: enZona(fechaEnZona(inicio)),
		},
		include: INCLUDE,
	});

	await recordAudit(prisma, {
		action: "cita.confirm",
		actor: input.actor,
		entityId: cita.id,
		entityLabel: citaLabel(cita),
		// The franja is what the customer asked for; the hour is what they got. Keep both.
		summary: `Cita #${cita.folio} confirmada (pidió ${current.franja ? FRANJAS[current.franja as keyof typeof FRANJAS].label.toLowerCase() : "sin franja"})`,
		before: { estado: current.estado, franja: current.franja, inicio: null },
		after: { estado: "confirmada", inicio: inicio.toISOString(), fin: fin.toISOString() },
	});

	return cita;
}

export async function asignarCita(input: { actor: Actor; id: string; asignadoId: unknown }) {
	if (!can(input.actor.role, "cita:assign")) throw new ClienteError(403, "Sin permiso: cita:assign");

	const current = await getCita(input.id);
	const asignadoId = await resolverAsignado(input.actor, input.asignadoId);
	if (asignadoId === current.asignadoId) throw new ClienteError(409, "La cita ya está así asignada.");

	const cita = await prisma.cita.update({
		where: { id: current.id },
		data: { asignadoId },
		include: INCLUDE,
	});

	await recordAudit(prisma, {
		action: "cita.assign",
		actor: input.actor,
		entityId: cita.id,
		entityLabel: citaLabel(cita),
		summary: asignadoId
			? `Cita #${cita.folio} asignada a ${cita.asignado?.name ?? asignadoId}`
			: `Cita #${cita.folio} sin asignar`,
		before: { asignadoId: current.asignadoId, asignado: current.asignado?.email ?? null },
		after: { asignadoId, asignado: cita.asignado?.email ?? null },
	});

	return cita;
}

/**
 * Move an appointment forward.
 *
 * Admin and Gerente may advance anything. An **Operador may only advance an appointment assigned
 * to them** — that is what makes `cita:advance` safe to hand to the whole counter. The check is on
 * the assignee, the same way `canRevokeInvitation` compares the issuer.
 *
 * Cancelling is deliberately NOT reachable here: it is `cita:cancel` and it requires a reason.
 */
export async function avanzarCita(input: { actor: Actor; id: string; estado: unknown }) {
	if (!can(input.actor.role, "cita:advance")) throw new ClienteError(403, "Sin permiso: cita:advance");

	const destino = input.estado;
	if (!isCitaEstado(destino)) throw new ClienteError(400, "Estado inválido");
	if (destino === "cancelada") {
		throw new ClienteError(400, "Para cancelar usa la acción de cancelar, que pide un motivo.");
	}

	const current = await getCita(input.id);
	if (!puedeTransicionar(current.estado, destino)) {
		throw new ClienteError(
			409,
			`No se puede pasar de ${citaEstadoLabel(current.estado)} a ${citaEstadoLabel(destino)}.`,
		);
	}

	// The database refuses these outright (cita_inicio_requerido_check). Catch it here so the
	// caller gets a Spanish message that says what to do, instead of a constraint violation.
	if (requiereHora(destino) && !current.inicio) {
		throw new ClienteError(409, "Primero confirma la cita para darle hora.");
	}

	// The ownership rule. Anyone who can reshape appointments outright skips it.
	if (!can(input.actor.role, "cita:update") && current.asignadoId !== input.actor.id) {
		throw new ClienteError(403, "Solo puedes avanzar las citas asignadas a ti.");
	}

	const cita = await prisma.cita.update({
		where: { id: current.id },
		data: { estado: destino as CitaEstado },
		include: INCLUDE,
	});

	await recordAudit(prisma, {
		action: "cita.advance",
		actor: input.actor,
		entityId: cita.id,
		entityLabel: citaLabel(cita),
		summary: `Cita #${cita.folio}: ${citaEstadoLabel(current.estado)} → ${citaEstadoLabel(destino)}`,
		before: { estado: current.estado },
		after: { estado: destino },
	});

	return cita;
}

/** Cancelling always says why — the reason is read back to the customer on the phone. */
export async function cancelarCita(input: { actor: Actor; id: string; motivo: unknown }) {
	if (!can(input.actor.role, "cita:cancel")) throw new ClienteError(403, "Sin permiso: cita:cancel");

	const motivo = trim(input.motivo, 255, "El motivo");
	if (!motivo) throw new ClienteError(400, "El motivo de la cancelación es obligatorio");

	const current = await getCita(input.id);
	if (!puedeTransicionar(current.estado, "cancelada")) {
		throw new ClienteError(409, `Una cita ${citaEstadoLabel(current.estado).toLowerCase()} ya no se cancela.`);
	}

	const cita = await prisma.cita.update({
		where: { id: current.id },
		data: { estado: "cancelada", canceladoMotivo: motivo },
		include: INCLUDE,
	});

	await recordAudit(prisma, {
		action: "cita.cancel",
		actor: input.actor,
		entityId: cita.id,
		entityLabel: citaLabel(cita),
		summary: `Cita #${cita.folio} cancelada: ${motivo}`,
		before: { estado: current.estado },
		after: { estado: "cancelada", motivo },
	});

	return cita;
}
