import { randomBytes, randomUUID } from "node:crypto";
import prisma from "$lib/prisma";
import { PERMISSIONS, can, type Permission, type Role } from "$lib/roles";
import {
	EVENTOS_EMPLEADO,
	NOTIFICACION_EVENTOS,
	isEvento,
	type EventoDef,
	type NotificacionEvento,
} from "$lib/notificaciones";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import { pageMeta, parsePageParams, skipFor, type PageParams } from "./paginate";
import { enviarPush } from "./push";
import type { Actor } from "./guard";

/**
 * Notifications: the in-app inbox, the device registry, and the one function that emits.
 *
 * Reading and clearing YOUR OWN inbox carries no permission key — it is inherent to having an
 * account, so these take an `Actor` and scope every query to `actor.id`. There is deliberately no
 * "read anyone's inbox" capability: a notification is a message to a person, and the audit trail
 * is the thing that exists for oversight.
 */

export class NotificacionError extends ClienteError {}

// ================================================================================================
// Emitir
// ================================================================================================

type Destino =
	/** One named staff member. */
	| { userId: string }
	/** Everyone holding a permission — the audience of a `difusion` event. */
	| { difusion: true }
	/** A customer. Their copy must never name a partner taller. */
	| { clienteId: string };

export type AvisoInput = {
	evento: NotificacionEvento;
	destino: Destino;
	titulo: string;
	cuerpo: string;
	url?: string | null;
	entidad?: string | null;
	entidadId?: string | null;
	/** Never notify somebody about their own action — they just did it and watched it happen. */
	excepto?: string | null;
};

/** Staff who hold a permission, for a `difusion` fan-out. */
async function usuariosCon(permiso: Permission, excepto?: string | null): Promise<string[]> {
	const roles = PERMISSIONS[permiso] as readonly Role[];
	const filas = await prisma.user.findMany({
		where: {
			role: { in: [...roles] },
			// A suspended account is not on the floor. Sending it push would also be a way to
			// confirm the address still exists.
			NOT: { banned: true },
			...(excepto ? { id: { not: excepto } } : {}),
		},
		select: { id: true },
	});
	return filas.map((f) => f.id);
}

/** Every active Admin. The last line of defence for a notification with nobody else to go to. */
async function administradores(): Promise<string[]> {
	const filas = await prisma.user.findMany({
		where: { role: "admin", NOT: { banned: true } },
		select: { id: true },
	});
	return filas.map((f) => f.id);
}

/**
 * Emit one notification.
 *
 * **This never throws.** It is called from inside business operations — receiving a vehicle,
 * registering a payment — and a push service being slow must not roll back a payment or fail the
 * request that took the money. Everything is caught and logged.
 *
 * Called AFTER the transaction commits, deliberately: a notification about a change that got
 * rolled back is a lie, and the inbox row is not part of the business invariant the way an audit
 * row is (Rule 3 covers the audit trail; this is a courtesy message on top of it).
 */
export async function notificar(input: AvisoInput): Promise<void> {
	try {
		// Widened to the declared shape: `as const satisfies` keeps each entry's literal type, so
		// reading `permiso` off the union would only compile for the entries that happen to have it.
		const def = NOTIFICACION_EVENTOS[input.evento] as EventoDef | undefined;
		if (!def) return;

		// A customer event addressed to a user (or the reverse) is a copy leak waiting to happen —
		// `cliente_*` copy is the only copy guaranteed not to name a partner taller.
		const paraCliente = "clienteId" in input.destino;
		if (paraCliente !== (def.audiencia === "cliente")) {
			console.error(`notificar: ${input.evento} no corresponde a la audiencia del destino`);
			return;
		}

		let userIds: string[] = [];
		let clienteIds: string[] = [];

		if ("clienteId" in input.destino) {
			clienteIds = [input.destino.clienteId];
		} else if ("userId" in input.destino) {
			if (input.destino.userId === input.excepto) return;
			userIds = [input.destino.userId];
		} else {
			if (!def.permiso) return;
			userIds = await usuariosCon(def.permiso, input.excepto);
		}

		// --- Un aviso SIEMPRE le llega a alguien -------------------------------------------------
		// A staff notification that resolves to nobody is worse than no notification: the shop
		// believes it was told. Three ways that happens, all real:
		//
		//   1. nobody holds the permission (a role list narrowed, an account suspended),
		//   2. the only person who did is the one who caused it (`excepto`),
		//   3. everybody who did has switched that event off.
		//
		// In all three the message falls back to the Admins, whose opt-out is IGNORED for the
		// fallback. Somebody being able to silence the whole shop by unchecking a box is exactly
		// the failure this exists to prevent. Customer notifications have no fallback: there is
		// nobody else it could correctly go to, and misdirecting it would be worse than dropping it.
		let forzados: string[] = [];
		if (clienteIds.length === 0 && userIds.length === 0) {
			forzados = await administradores();
			userIds = forzados;
			if (userIds.length === 0) {
				// No live Admin at all. The database guarantees one exists, so reaching here means
				// something is very wrong — say so loudly rather than dropping the message silently.
				console.error(`notificar: ${input.evento} no tiene a quién llegarle; ni un admin activo`);
				return;
			}
		}

		if (userIds.length === 0 && clienteIds.length === 0) return;

		// Opt-outs, read in one query. An absent row means both channels on, so a new hire and a
		// new event key both work with no backfill.
		const apagados =
			userIds.length > 0
				? await prisma.notificacion_preferencia.findMany({
						where: { userId: { in: userIds }, evento: input.evento },
						select: { userId: true, enApp: true, push: true },
					})
				: [];
		const pref = new Map(apagados.map((p) => [p.userId, p]));

		let enApp = userIds.filter((id) => pref.get(id)?.enApp !== false);
		let conPush = userIds.filter((id) => pref.get(id)?.push !== false);

		// Everyone opted out of the in-app copy. The inbox is the system of record, so this is the
		// case that would leave no trace at all — fall back rather than let it vanish.
		if (enApp.length === 0 && clienteIds.length === 0) {
			const admins = forzados.length > 0 ? forzados : await administradores();
			if (admins.length === 0) {
				console.error(`notificar: ${input.evento} quedó sin bandeja; ni un admin activo`);
				return;
			}
			enApp = admins;
			// Push stays opted-out: the fallback guarantees the message is READABLE, it does not
			// override somebody's choice about being buzzed on their phone at 9pm.
			conPush = conPush.filter((id) => admins.includes(id) || userIds.includes(id));
		}

		const base = {
			evento: input.evento,
			titulo: input.titulo.slice(0, 120),
			cuerpo: input.cuerpo.slice(0, 500),
			url: input.url ?? null,
			entidad: input.entidad ?? null,
			entidadId: input.entidadId ?? null,
		};

		const filas = [
			...enApp.map((userId) => ({ id: randomUUID(), userId, clienteId: null, ...base })),
			...clienteIds.map((clienteId) => ({ id: randomUUID(), userId: null, clienteId, ...base })),
		];
		if (filas.length > 0) await prisma.notificacion.createMany({ data: filas });

		// Push carries the row id so a click can mark it read without another round trip.
		await enviarPush({ userIds: conPush, clienteIds }, { ...base, id: filas[0]?.id, prioritario: def.prioritario });
	} catch (err) {
		// A notification that failed to send is not a reason to fail the work it was about.
		console.error("notificar falló:", err);
	}
}

/** The customer-facing half of the event catalogue, by type. */
export type EventoCliente = Extract<NotificacionEvento, `cliente_${string}`>;

type NotaParaAviso = { id: string; folio: number; clienteId: string; seguimientoToken: string | null };

/**
 * Tell the customer something about their service note.
 *
 * **The single door for customer-facing notifications**, so the rules live in one place instead of
 * at every call site:
 *
 * - the deep link is always the note's own `/seguimiento/<token>`, never a `/panel` URL the
 *   customer cannot open;
 * - the event key is constrained to `cliente_*`, which is the half of the catalogue whose copy is
 *   written to never name a partner taller (see `notaParaCliente`).
 *
 * Takes either a loaded note or just its id — callers that already have the row spend no extra
 * query, callers deep in the money code do not have to fetch one just to notify.
 */
export async function avisarClienteDeNota(
	nota: string | NotaParaAviso,
	aviso: { evento: EventoCliente; titulo: string; cuerpo: string },
): Promise<void> {
	let fila: NotaParaAviso | null;
	if (typeof nota === "string") {
		fila = await prisma.nota_servicio.findUnique({
			where: { id: nota },
			select: { id: true, folio: true, clienteId: true, seguimientoToken: true },
		});
	} else {
		fila = nota;
	}
	if (!fila) return;

	await notificar({
		evento: aviso.evento,
		destino: { clienteId: fila.clienteId },
		titulo: aviso.titulo,
		cuerpo: aviso.cuerpo,
		url: fila.seguimientoToken ? `/seguimiento/${fila.seguimientoToken}` : null,
		entidad: "nota",
		entidadId: fila.id,
	});
}

// ================================================================================================
// Bandeja
// ================================================================================================

export const publicNotificacion = (n: {
	id: string;
	evento: string;
	titulo: string;
	cuerpo: string;
	url: string | null;
	entidad: string | null;
	entidadId: string | null;
	leidaAt: Date | null;
	createdAt: Date;
}) => ({
	id: n.id,
	evento: n.evento,
	titulo: n.titulo,
	cuerpo: n.cuerpo,
	url: n.url,
	entidad: n.entidad,
	entidadId: n.entidadId,
	leida: n.leidaAt !== null,
	createdAt: n.createdAt.toISOString(),
});

export type NotificacionQuery = { noLeidas?: boolean } & Partial<PageParams>;

export function parseNotificacionQuery(params: URLSearchParams): NotificacionQuery {
	return { noLeidas: params.get("noLeidas") === "1", ...parsePageParams(params) };
}

export async function listarNotificaciones(actor: Actor, query: NotificacionQuery = {}) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 25 };
	const where = { userId: actor.id, ...(query.noLeidas ? { leidaAt: null } : {}) };

	const [total, rows, noLeidas] = await Promise.all([
		prisma.notificacion.count({ where }),
		prisma.notificacion.findMany({
			where,
			orderBy: { createdAt: "desc" },
			skip: skipFor(paging),
			take: paging.perPage,
		}),
		prisma.notificacion.count({ where: { userId: actor.id, leidaAt: null } }),
	]);

	return { notificaciones: rows.map(publicNotificacion), noLeidas, ...pageMeta(total, paging) };
}

export const contarNoLeidas = (userId: string) => prisma.notificacion.count({ where: { userId, leidaAt: null } });

/**
 * Mark read. With no ids, marks everything.
 *
 * Scoped by `userId` in the WHERE rather than by fetching and checking: an id belonging to
 * somebody else simply matches nothing, so a guessed id cannot even confirm the row exists.
 * Not audited — marking your own message read is not a change to the shop's records.
 */
export async function marcarLeidas(actor: Actor, ids?: string[]): Promise<number> {
	const { count } = await prisma.notificacion.updateMany({
		where: {
			userId: actor.id,
			leidaAt: null,
			...(ids && ids.length > 0 ? { id: { in: ids.slice(0, 200) } } : {}),
		},
		data: { leidaAt: new Date() },
	});
	return count;
}

// ================================================================================================
// Dispositivos
// ================================================================================================

const publicDispositivo = (d: {
	id: string;
	etiqueta: string | null;
	userAgent: string | null;
	fallos: number;
	ultimoEnvioAt: Date | null;
	createdAt: Date;
}) => ({
	id: d.id,
	etiqueta: d.etiqueta ?? "Este navegador",
	userAgent: d.userAgent,
	fallos: d.fallos,
	ultimoEnvioAt: d.ultimoEnvioAt?.toISOString() ?? null,
	createdAt: d.createdAt.toISOString(),
});

export const listarDispositivos = async (userId: string) =>
	(await prisma.push_suscripcion.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })).map(
		publicDispositivo,
	);

/** How many devices one recipient may register. Stops a loop from filling the table. */
const MAX_DISPOSITIVOS = 20;

/**
 * Register (or refresh) a browser.
 *
 * Keyed on the endpoint, which is what the push service considers the identity of a subscription:
 * the same browser re-subscribing updates its row instead of piling up duplicates that would each
 * deliver the same notification to the same screen.
 *
 * **The owner is taken from the caller's session, never from the body.** Accepting a `userId`
 * here would let anybody point somebody else's notifications at their own device.
 */
export async function guardarSuscripcion(input: {
	dueno: { userId: string } | { clienteId: string };
	body: Record<string, unknown>;
	userAgent?: string | null;
	actor?: Actor | null;
}) {
	const endpoint = trim(input.body.endpoint, 500, "El endpoint");
	const p256dh = trim(input.body.p256dh, 255, "La llave p256dh");
	const auth = trim(input.body.auth, 64, "El secreto auth");
	if (!endpoint || !p256dh || !auth) {
		throw new NotificacionError(400, "Faltan datos de la suscripción (endpoint, p256dh, auth).");
	}
	// Anything but an https: URL is not a push service; an http: or file: endpoint would make the
	// server issue a signed request to an attacker-chosen host.
	if (!/^https:\/\//i.test(endpoint)) {
		throw new NotificacionError(400, "El endpoint de push debe ser una URL https.");
	}

	const dueno = "userId" in input.dueno ? { userId: input.dueno.userId } : { clienteId: input.dueno.clienteId };

	const existente = await prisma.push_suscripcion.findUnique({ where: { endpoint } });
	if (!existente) {
		const cuantas = await prisma.push_suscripcion.count({ where: dueno });
		if (cuantas >= MAX_DISPOSITIVOS) {
			throw new NotificacionError(
				409,
				`Ya hay ${MAX_DISPOSITIVOS} dispositivos registrados. Quita uno antes de agregar otro.`,
			);
		}
	}

	const sub = await prisma.push_suscripcion.upsert({
		where: { endpoint },
		create: {
			id: randomUUID(),
			endpoint,
			p256dh,
			auth,
			etiqueta: trim(input.body.etiqueta, 80, "La etiqueta"),
			userAgent: input.userAgent?.slice(0, 255) ?? null,
			...dueno,
		},
		update: {
			p256dh,
			auth,
			fallos: 0,
			userAgent: input.userAgent?.slice(0, 255) ?? null,
			// Re-subscribing on a device somebody else used moves it, rather than delivering their
			// notifications to whoever is logged in now.
			userId: "userId" in dueno ? dueno.userId : null,
			clienteId: "clienteId" in dueno ? dueno.clienteId : null,
		},
	});

	if (input.actor) {
		await recordAudit(prisma, {
			action: "push.subscribe",
			actor: input.actor,
			entityId: sub.id,
			entityLabel: sub.etiqueta ?? "dispositivo",
			// NEVER the endpoint, the p256dh or the auth secret: together they are enough to send
			// this person notifications. The trail records that a device was added, not how to use it.
			summary: "Registró un dispositivo para recibir avisos",
		});
	}

	return { id: sub.id, nueva: !existente };
}

/** Unregister. Either by row id (from the device list) or by endpoint (from the browser). */
export async function borrarSuscripcion(input: {
	dueno: { userId: string } | { clienteId: string };
	id?: string | null;
	endpoint?: string | null;
	actor?: Actor | null;
}) {
	const dueno = "userId" in input.dueno ? { userId: input.dueno.userId } : { clienteId: input.dueno.clienteId };
	if (!input.id && !input.endpoint) throw new NotificacionError(400, "Falta el dispositivo a quitar.");

	// The ownership condition is in the WHERE, so somebody else's id deletes nothing.
	const { count } = await prisma.push_suscripcion.deleteMany({
		where: { ...dueno, ...(input.id ? { id: input.id } : { endpoint: input.endpoint! }) },
	});
	if (count === 0) throw new NotificacionError(404, "Ese dispositivo no está registrado.");

	if (input.actor) {
		await recordAudit(prisma, {
			action: "push.unsubscribe",
			actor: input.actor,
			entityId: input.id ?? null,
			summary: "Quitó un dispositivo de los avisos",
		});
	}

	return { removidas: count };
}

// ================================================================================================
// Preferencias
// ================================================================================================

/** Every switchable event with its current state. Absent row = on, which is the default. */
export async function preferencias(userId: string) {
	const filas = await prisma.notificacion_preferencia.findMany({ where: { userId } });
	const mapa = new Map(filas.map((f) => [f.evento, f]));

	return EVENTOS_EMPLEADO.map((evento) => ({
		evento,
		...NOTIFICACION_EVENTOS[evento],
		enApp: mapa.get(evento)?.enApp ?? true,
		push: mapa.get(evento)?.push ?? true,
	}));
}

export async function guardarPreferencias(input: {
	actor: Actor;
	/** `{ [evento]: { enApp, push } }`. Events not present are left alone. */
	cambios: Record<string, { enApp?: boolean; push?: boolean }>;
}) {
	const entradas = Object.entries(input.cambios).filter(([evento]) => isEvento(evento));
	if (entradas.length === 0) throw new NotificacionError(400, "No hay preferencias que guardar.");

	await prisma.$transaction(
		entradas.map(([evento, valor]) =>
			prisma.notificacion_preferencia.upsert({
				where: { userId_evento: { userId: input.actor.id, evento } },
				create: {
					userId: input.actor.id,
					evento,
					enApp: valor.enApp ?? true,
					push: valor.push ?? true,
				},
				update: {
					...(valor.enApp === undefined ? {} : { enApp: valor.enApp }),
					...(valor.push === undefined ? {} : { push: valor.push }),
				},
			}),
		),
	);

	await recordAudit(prisma, {
		action: "notificacion.preferencias",
		actor: input.actor,
		entityId: input.actor.id,
		entityLabel: input.actor.email,
		summary: `Actualizó ${entradas.length} preferencia(s) de avisos`,
		after: input.cambios as never,
	});

	return preferencias(input.actor.id);
}

// ================================================================================================
// Envío a mano
// ================================================================================================

/**
 * Send a message by hand — `notificacion:send`.
 *
 * The recipient is a staff user id or a customer id, and the copy is written by a person, so this
 * is the one path where the taller-invisibility rule cannot be enforced by the template. It is
 * audited with the full text for exactly that reason.
 */
export async function enviarAviso(input: { actor: Actor; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "notificacion:send")) {
		throw new NotificacionError(403, "Sin permiso: notificacion:send");
	}

	const titulo = trim(input.body.titulo, 120, "El título");
	const cuerpo = trim(input.body.cuerpo, 500, "El mensaje");
	if (!titulo || !cuerpo) throw new NotificacionError(400, "El título y el mensaje son obligatorios.");

	const userId = trim(input.body.userId);
	const clienteId = trim(input.body.clienteId);
	if (!userId === !clienteId) {
		throw new NotificacionError(400, "Indica exactamente un destinatario: userId o clienteId.");
	}

	const url = trim(input.body.url, 500, "La liga");
	if (url && !url.startsWith("/")) {
		// Only in-app deep links. An absolute URL in a notification is a phishing primitive.
		throw new NotificacionError(400, "La liga debe ser una ruta interna, empezando con /.");
	}

	if (userId) {
		const existe = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
		if (!existe) throw new NotificacionError(404, "Ese usuario no existe.");
		await notificar({ evento: "aviso_manual", destino: { userId }, titulo, cuerpo, url });
	} else {
		const existe = await prisma.cliente.findUnique({ where: { id: clienteId! }, select: { id: true } });
		if (!existe) throw new NotificacionError(404, "Ese cliente no existe.");
		await notificar({ evento: "cliente_comentario", destino: { clienteId: clienteId! }, titulo, cuerpo });
	}

	await recordAudit(prisma, {
		action: "notificacion.send",
		actor: input.actor,
		entityId: userId ?? clienteId,
		entityLabel: titulo,
		summary: `Envió un aviso a mano: ${titulo}`,
		after: { titulo, cuerpo, url },
	});

	return { enviado: true };
}

// ================================================================================================
// Seguimiento del cliente
// ================================================================================================

/**
 * 256 bits, base64url-ish hex. The tracking link IS the credential, so it has to be unguessable
 * on its own — there is no account behind it to fall back on.
 */
export const nuevoTokenSeguimiento = (): string => randomBytes(32).toString("hex");

/**
 * Resolve a tracking token to the note it belongs to.
 *
 * Anonymous: anybody with the link gets in, which is the point — the customer has no account.
 * The link is handed over by WhatsApp to a number the shop already has on file.
 */
export async function notaPorToken(token: string) {
	if (!token || token.length < 32) throw new NotificacionError(404, "Liga de seguimiento no válida.");
	const nota = await prisma.nota_servicio.findUnique({
		where: { seguimientoToken: token },
		select: { id: true, clienteId: true },
	});
	if (!nota) throw new NotificacionError(404, "Liga de seguimiento no válida.");
	return nota;
}
