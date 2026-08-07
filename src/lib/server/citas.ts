import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import {
	DURACION_MINUTOS,
	FRANJAS,
	GRACIA_MINUTOS,
	citaEstadoLabel,
	citaTipoLabel,
	isCitaEstado,
	isCitaTipo,
	isFranja,
	motivoVencida,
	puedeTransicionar,
	requiereHora,
	type CitaEstado,
	type CitaTipo,
	type MotivoVencida,
} from "$lib/citas";
import {
	acomodar,
	enZona,
	fechaEnZona,
	fechaLarga,
	horaEnZona,
	hoy,
	parseFecha,
	rangoVista,
	semanaDe,
	sumarDias,
	celdasDeMes,
	VISTAS,
	type Vista,
} from "$lib/agenda";
import { recordAudit } from "./audit";
import { ClienteError, createCliente, getCliente, listClientes, trim } from "./clientes";
import { listContactos } from "./contactos";
import { notificar } from "./notificaciones";
import { createUnidad, listUnidades, sugerirUnidades } from "./unidades";
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
export const citaLabel = (c: { folio: number; nombre: string; marca: string | null; modelo: string | null }) =>
	[`#${c.folio}`, c.nombre, [c.marca, c.modelo].filter(Boolean).join(" ")].filter(Boolean).join(" · ");

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
	nota?: { id: string; folio: number; estado: string } | null;
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
	// The service note opened when the unit actually arrived, if it already did.
	notaId: c.nota?.id ?? null,
	notaFolio: c.nota?.folio ?? null,
	notaEstado: c.nota?.estado ?? null,
	// Derived from the clock, not stored: an appointment stops being overdue the moment
	// somebody acts on it.
	motivoVencida: motivoVencidaDe({
		estado: c.estado,
		fecha: c.fecha.toISOString().slice(0, 10),
		inicio: c.inicio?.toISOString() ?? null,
	}),
	createdAt: c.createdAt.toISOString(),
});

export type CitaPublica = ReturnType<typeof publicCita>;

const INCLUDE = {
	cliente: { select: { nombreCompleto: true, tipo: true } },
	unidad: { select: { marca: true, modelo: true, placas: true } },
	asignado: { select: { name: true, email: true, role: true } },
	entregador: { select: { nombre: true, telefono: true, roles: true } },
	// At most one per appointment. Lets the list jump straight to the note once the unit arrived,
	// instead of making the counter search for it by plate.
	nota: { select: { id: true, folio: true, estado: true } },
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
	vencidas?: boolean;
} & Partial<PageParams>;

/**
 * The `WHERE` for overdue appointments — derived from the clock, never stored.
 *
 * Two buckets, because they are two different lost sales: a request nobody ever confirmed, and a
 * confirmed slot whose hour passed with nothing recorded against it. An appointment leaves this
 * list the moment somebody acts on it, which is the point.
 */
/** Asked for a day that has already passed, still never confirmed. */
export const whereSinAtender = (): Prisma.citaWhereInput => ({
	estado: "solicitada",
	fecha: { lt: enZona(hoy()) },
});

/** Confirmed, its slot is well past, and nobody moved it along. */
export const whereSinProcesar = (ahora = new Date()): Prisma.citaWhereInput => ({
	estado: "confirmada",
	inicio: { not: null, lt: new Date(ahora.getTime() - GRACIA_MINUTOS * 60_000) },
});

export function whereVencidas(ahora = new Date()): Prisma.citaWhereInput {
	return { OR: [whereSinAtender(), whereSinProcesar(ahora)] };
}

/** Which bucket a row falls in. The rule itself is pure — see `motivoVencida` in $lib/citas. */
const motivoVencidaDe = (c: { estado: string; fecha: string; inicio: string | null }) =>
	motivoVencida(c, new Date(), hoy());

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
		vencidas: params.get("vencidas") === "1",
		...parsePageParams(params),
	};
}

function whereFor(query: CitaQuery): Prisma.citaWhereInput {
	const desde = parseFecha(query.desde);
	const hasta = parseFecha(query.hasta);
	const folio = query.q ? Number(query.q.replace("#", "")) : NaN;

	return {
		...(query.vencidas ? whereVencidas() : {}),
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
	// Which day columns the view draws. The month grid is Monday-aligned whole weeks (you read it
	// against "the 15th is a Tuesday"); everything else is a rolling span from the anchor.
	const dias =
		vista === "dia"
			? [fecha]
			: vista === "mes"
				? celdasDeMes(fecha)
				: vista === "agenda"
					? Array.from({ length: VISTAS.agenda.dias }, (_, i) => sumarDias(fecha, i))
					: semanaDe(fecha);

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
 * Everything `ClienteUnidadPicker` needs to render for one appointment: the customers to search,
 * the chosen customer's fleet, the vehicles already on file that match what the customer typed,
 * and the contacts allowed to hand a unit over.
 *
 * Shared by the cita detail screen and the board, which render the same drawer (Rule 5). Loading
 * it by hand in each is how one of them quietly stops offering the suggestions.
 *
 * Caller MUST have checked `cita:update` — this is the data behind `vincularCita`.
 *
 * `clienteElegido` lets the drawer preview another customer's units before anything is saved.
 */
export async function datosParaVincular(cita: CitaPublica, clienteElegido: string | null) {
	const [clientes, unidades, sugeridas, entregadores] = await Promise.all([
		listClientes({ q: null, perPage: 100 }).then((r) =>
			r.clientes.map((c) => ({ id: c.id, nombreCompleto: c.nombreCompleto, tipoLabel: c.tipoLabel })),
		),
		clienteElegido
			? listUnidades({ clienteId: clienteElegido, perPage: 100 }).then((r) =>
					r.unidades.map((u) => ({
						id: u.id,
						etiqueta: u.etiqueta,
						// `etiqueta` prefers placas, so a fleet's número económico would otherwise never
						// appear in the no-JS list — the one identifier they actually use.
						numeroEconomico: u.numeroEconomico,
						vin: u.vin,
						anio: u.anio,
						color: u.color,
						archivado: u.archivado,
					})),
				)
			: [],
		// Scoped to the customer's fleet once one is known; otherwise searched across the whole
		// registry, which is how a returning customer is recognised from their plates alone.
		sugerirUnidades({
			placas: cita.placas,
			marca: cita.marca,
			modelo: cita.modelo,
			clienteId: clienteElegido,
		}),
		clienteElegido
			? listContactos(clienteElegido).then((cs) =>
					cs
						.filter((c) => c.roles.includes("entregador"))
						.map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono })),
				)
			: [],
	]);

	return { clientes, unidades, sugeridas, entregadores };
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
			where: {
				asignadoId: userId,
				fecha: { gte: enZona(hoy()) },
				estado: { notIn: ["cancelada", "completada"] },
			},
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

	// A request nobody sees is a lost sale — this is the same failure `citas vencidas` reports
	// after the fact, told to somebody while it can still be acted on.
	await notificar({
		evento: "cita_solicitada",
		destino: { difusion: true },
		titulo: "Nueva solicitud de cita",
		cuerpo: `${cita.nombre} · ${fecha} ${FRANJAS[franja].label.toLowerCase()} — ${cita.motivo}`,
		url: `/panel/citas/${cita.id}`,
		entidad: "cita",
		entidadId: cita.id,
	});

	return cita;
}

/** The counter path. Staff book an exact hour, so `inicio` is required. */
export async function crearCita(input: { actor: Actor; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cita:create")) throw new ClienteError(403, "Sin permiso: cita:create");

	const { tipo, direccionRecoleccion } = leerTipo(input.body);
	const inicio = leerInstante(input.body.inicio, "La hora de inicio");
	const fin = input.body.fin ? leerInstante(input.body.fin, "La hora de fin") : finPorDefecto(inicio);
	if (fin <= inicio) throw new ClienteError(400, "La hora de fin debe ser posterior al inicio");

	// A counter booking is born `confirmada`, and a confirmed appointment means a specific car
	// for a specific person — the same rule `confirmarCita` enforces. The drawer defaults to
	// searching the registry, with creating either side one radio away.
	//
	// Resolved BEFORE the contact snapshot, because picking an existing customer means the form
	// never posts a name or a phone: they come off the records instead. Requiring them here would
	// make choosing a registered customer impossible.
	const { clienteId, unidadId, entregadorId, cliente, unidad } = await resolverClienteYUnidad(
		input.actor,
		input.body,
		{
			nombre: trim(input.body.nombre) ?? "",
			telefono: trim(input.body.telefono) ?? "",
			email: trim(input.body.email),
			marca: trim(input.body.marca),
			modelo: trim(input.body.modelo),
			anio: int(input.body.anio),
			placas: trim(input.body.placas),
		},
	);

	// The free-text snapshot mirrors what was linked, so the row still reads correctly even if
	// the customer is renamed or the vehicle is transferred later.
	const contacto = leerDatosContacto({
		...input.body,
		nombre: trim(input.body.nombre) ?? cliente.nombreCompleto,
		telefono: trim(input.body.telefono) ?? cliente.telefono,
		email: trim(input.body.email) ?? cliente.email,
		marca: trim(input.body.marca) ?? unidad.marca,
		modelo: trim(input.body.modelo) ?? unidad.modelo,
		anio: input.body.anio ?? unidad.anio,
		placas: trim(input.body.placas) ?? unidad.placas,
	});

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
			entregadorId,
			asignadoId,
		},
		include: INCLUDE,
	});

	await recordAudit(prisma, {
		action: "cita.create",
		actor: input.actor,
		entityId: cita.id,
		entityLabel: citaLabel(cita),
		summary: `Cita creada para ${cita.cliente?.nombreCompleto ?? cita.nombre} el ${cita.fecha.toISOString().slice(0, 10)}`,
		after: { inicio: inicio.toISOString(), fin: fin.toISOString(), tipo, clienteId, unidadId, asignadoId },
	});

	await avisarAsignado(cita, input.actor.id);

	return cita;
}

/**
 * Tell somebody a vehicle is now theirs to handle.
 *
 * `directo`, not `difusion`: "you have to go collect a truck at 3" is only actionable for the one
 * person it landed on, and broadcasting it to the whole counter is how people learn to ignore
 * notifications. Nobody is ever notified of their own assignment.
 */
async function avisarAsignado(
	cita: { id: string; folio: number; asignadoId: string | null; tipo: string; inicio: Date | null; nombre: string },
	actorId: string,
) {
	if (!cita.asignadoId) return;
	const cuando = cita.inicio ? ` · ${horaEnZona(cita.inicio)}` : "";
	await notificar({
		evento: "cita_asignada",
		destino: { userId: cita.asignadoId },
		titulo: cita.tipo === "recoleccion" ? "Te toca una recolección" : "Te asignaron una cita",
		cuerpo: `Cita #${cita.folio}${cuando} — ${cita.nombre}`,
		url: `/panel/citas/${cita.id}`,
		entidad: "cita",
		entidadId: cita.id,
		excepto: actorId,
	});
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
		throw new ClienteError(
			403,
			alCrear ? "Sin permiso para asignar la cita: cita:assign" : "Sin permiso: cita:assign",
		);
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

	const { clienteId, unidadId, entregadorId, cliente } = await resolverClienteYUnidad(input.actor, input.body, {
		nombre: current.nombre,
		telefono: current.telefono,
		email: current.email,
		marca: current.marca,
		modelo: current.modelo,
		anio: current.anio,
		placas: current.placas,
	});

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

/** What the caller already knows about the vehicle and its owner, used to prefill a create. */
type Prefill = {
	nombre: string;
	telefono: string;
	email: string | null;
	marca: string | null;
	modelo: string | null;
	anio: number | null;
	placas: string | null;
};

/**
 * Resolve a customer, a vehicle and an optional handover person out of a request body — picking
 * existing records or creating them from `prefill`.
 *
 * Shared by `vincularCita` and `crearCita` so the counter's "new appointment" form and the
 * "link this request" drawer cannot drift on who a vehicle may belong to (Rule 5).
 */
async function resolverClienteYUnidad(actor: Actor, body: Record<string, unknown>, prefill: Prefill) {
	let clienteId = trim(body.clienteId);

	if (body.crearCliente === "1" || body.crearCliente === "on") {
		const tipo = trim(body.tipoCliente) === "organizacion" ? "organizacion" : "persona";
		// Prefilled from what is already known, so the counter only corrects what is wrong.
		// The drawer offers ONE field for both cases ("Nombre / Razón social"), so an organización
		// accepts `nombre` as its razón social — otherwise typing a company name there would be
		// silently dropped and the record created under the caller's personal name instead.
		const cliente = await createCliente({
			actor,
			body: {
				tipo,
				...(tipo === "persona"
					? { nombre: trim(body.nombre) ?? prefill.nombre, apellidos: trim(body.apellidos) }
					: { razonSocial: trim(body.razonSocial) ?? trim(body.nombre) ?? prefill.nombre }),
				telefono: trim(body.telefono) ?? prefill.telefono,
				email: trim(body.email) ?? prefill.email,
			},
		});
		clienteId = cliente.id;
	}

	// A suggestion wins over the search box: it is the more deliberate pick, and with JavaScript
	// off both controls are in the form at once.
	let unidadId = trim(body.sugeridaId) ?? trim(body.unidadId);
	const creandoUnidad = body.crearUnidad === "1" || body.crearUnidad === "on";

	// A vehicle already knows who owns it, so picking one is enough to identify the customer.
	// That is what lets a suggestion be a single radio — with JavaScript off, one input cannot
	// post two fields — and it is how a returning customer is recognised from their plates.
	if (!clienteId && unidadId && !creandoUnidad) {
		const dueño = await prisma.unidad.findUnique({ where: { id: unidadId }, select: { clienteId: true } });
		if (!dueño) throw new ClienteError(404, "Unidad no encontrada");
		clienteId = dueño.clienteId;
	}

	if (!clienteId) throw new ClienteError(400, "Elige un cliente o crea uno nuevo");
	const cliente = await getCliente(clienteId);
	if (cliente.archivedAt) throw new ClienteError(409, "Ese cliente está archivado.");

	if (creandoUnidad) {
		const unidad = await createUnidad({
			actor,
			clienteId,
			body: {
				marca: trim(body.marca) ?? prefill.marca,
				modelo: trim(body.modelo) ?? prefill.modelo,
				anio: body.anio ?? prefill.anio,
				placas: trim(body.placas) ?? prefill.placas,
				vin: trim(body.vin),
			},
		});
		unidadId = unidad.id;
	}

	if (!unidadId) throw new ClienteError(400, "Elige una unidad o crea una nueva");
	const unidad = await prisma.unidad.findUnique({
		where: { id: unidadId },
		select: { clienteId: true, archivedAt: true, marca: true, modelo: true, anio: true, placas: true },
	});
	if (!unidad) throw new ClienteError(404, "Unidad no encontrada");
	if (unidad.clienteId !== clienteId) {
		throw new ClienteError(400, "Esa unidad no pertenece al cliente seleccionado");
	}
	if (unidad.archivedAt) throw new ClienteError(409, "Esa unidad está archivada.");

	return {
		clienteId,
		unidadId,
		cliente,
		unidad,
		entregadorId: await resolverEntregador(clienteId, body.entregadorId),
	};
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
		throw new ClienteError(409, "Antes de confirmar, vincula la cita a un cliente y a una unidad.");
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

	// A cita has no tracking token — those belong to service notes — so this lands in the customer's
	// inbox with no deep link, and reaches their phone only if they already turned push on during a
	// previous visit. That is the honest ceiling of "notify a customer who has no account".
	if (cita.clienteId) {
		await notificar({
			evento: "cliente_cita_confirmada",
			destino: { clienteId: cita.clienteId },
			titulo: "Tu cita quedó confirmada",
			cuerpo: `${fechaLarga(fechaEnZona(inicio))} a las ${horaEnZona(inicio)}. Cita #${cita.folio}.`,
			entidad: "cita",
			entidadId: cita.id,
		});
	}

	await avisarAsignado(cita, input.actor.id);

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

	await avisarAsignado(cita, input.actor.id);

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
