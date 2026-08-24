/**
 * The customer-facing side of a channel conversation: the persistent thread (`canal_conversacion`
 * + `canal_mensaje`) a webhook writes into, and the bot/humano handoff staff drive from
 * `/panel/chat`. Distinct from `conversacion.ts`, which is the ephemeral (30-minute) booking-flow
 * state machine — that machine's steps are recorded here too, as ordinary inbound/outbound
 * messages, but this module never knows what `paso` a booking is on.
 */
import { randomUUID } from "node:crypto";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { recordAudit } from "$lib/server/audit";
import { ClienteError } from "$lib/server/clientes";
import * as telegram from "$lib/server/canales/telegram";
import * as whatsapp from "$lib/server/canales/whatsapp";
import type { Actor } from "$lib/server/guard";

const PREVIEW_MAX = 280;
const preview = (texto: string) => (texto.length > PREVIEW_MAX ? texto.slice(0, PREVIEW_MAX - 1) + "…" : texto);

function requireChat(actor: Actor) {
	if (!can(actor.role, "canal:chat")) throw new ClienteError(403, "Sin permiso: canal:chat");
}

/**
 * Record an inbound message, creating the conversation on first contact. Returns the current
 * `modo` so the webhook route knows whether to run the bot flow for this message or leave it
 * alone — a `humano` conversation only ever gets its messages recorded here, never answered
 * automatically.
 */
export async function registrarMensajeEntrante(input: {
	canal: "whatsapp" | "telegram";
	idExterno: string;
	texto: string;
	nombreCanal?: string | null;
}): Promise<{ conversacionId: string; modo: string }> {
	const conversacion = await prisma.canal_conversacion.upsert({
		where: { canal_idExterno: { canal: input.canal, idExterno: input.idExterno } },
		create: {
			id: randomUUID(),
			canal: input.canal,
			idExterno: input.idExterno,
			nombreCanal: input.nombreCanal ?? null,
			ultimoMensajeTexto: preview(input.texto),
		},
		update: {
			// A returning contact's display name can change (WhatsApp profile name, Telegram
			// @username) — keep the latest one rather than freezing on whatever they were called
			// the first time they wrote in.
			...(input.nombreCanal ? { nombreCanal: input.nombreCanal } : {}),
			ultimoMensajeAt: new Date(),
			ultimoMensajeTexto: preview(input.texto),
		},
	});

	await prisma.canal_mensaje.create({
		data: { id: randomUUID(), conversacionId: conversacion.id, direccion: "entrante", texto: input.texto },
	});

	return { conversacionId: conversacion.id, modo: conversacion.modo };
}

/** The bot's own reply, in `modo: "bot"` conversations — recorded the same as a human's would be. */
export async function registrarMensajeBot(conversacionId: string, texto: string): Promise<void> {
	await prisma.$transaction([
		prisma.canal_mensaje.create({
			data: { id: randomUUID(), conversacionId, direccion: "saliente", texto },
		}),
		prisma.canal_conversacion.update({
			where: { id: conversacionId },
			data: { ultimoMensajeAt: new Date(), ultimoMensajeTexto: preview(texto) },
		}),
	]);
}

/**
 * Same as `registrarMensajeBot`, keyed by channel + external id instead of the conversation's own
 * id — for call sites (Telegram's many command handlers) that only ever have the chat id on hand.
 */
export async function registrarMensajeBotPorExterno(
	canal: "whatsapp" | "telegram",
	idExterno: string,
	texto: string,
): Promise<void> {
	const conversacion = await prisma.canal_conversacion.findUnique({ where: { canal_idExterno: { canal, idExterno } } });
	if (!conversacion) return; // no inbound recorded for this chat yet — nothing to attach the reply to
	await registrarMensajeBot(conversacion.id, texto);
}

/** List conversations for the inbox, most recently active first. */
export async function listConversaciones(actor: Actor) {
	requireChat(actor);
	const filas = await prisma.canal_conversacion.findMany({
		orderBy: { ultimoMensajeAt: "desc" },
		take: 100,
		include: { tomadaPor: { select: { name: true } }, cliente: { select: { nombreCompleto: true } } },
	});
	return filas.map((c) => ({
		id: c.id,
		canal: c.canal,
		idExterno: c.idExterno,
		nombre: c.cliente?.nombreCompleto ?? c.nombreCanal ?? c.idExterno,
		modo: c.modo,
		tomadaPorNombre: c.tomadaPor?.name ?? null,
		ultimoMensajeAt: c.ultimoMensajeAt.toISOString(),
		ultimoMensajeTexto: c.ultimoMensajeTexto,
	}));
}

/** One conversation's full thread, for the panel. */
export async function getConversacion(actor: Actor, id: string) {
	requireChat(actor);
	const conversacion = await prisma.canal_conversacion.findUnique({
		where: { id },
		include: {
			tomadaPor: { select: { name: true } },
			cliente: { select: { nombreCompleto: true } },
			mensajes: { orderBy: { createdAt: "asc" }, include: { autor: { select: { name: true } } } },
		},
	});
	if (!conversacion) throw new ClienteError(404, "Conversación no encontrada");

	return {
		id: conversacion.id,
		canal: conversacion.canal,
		idExterno: conversacion.idExterno,
		nombre: conversacion.cliente?.nombreCompleto ?? conversacion.nombreCanal ?? conversacion.idExterno,
		modo: conversacion.modo,
		tomadaPorNombre: conversacion.tomadaPor?.name ?? null,
		mensajes: conversacion.mensajes.map((m) => ({
			id: m.id,
			direccion: m.direccion,
			texto: m.texto,
			autorNombre: m.autor?.name ?? (m.direccion === "saliente" ? "Bot" : null),
			createdAt: m.createdAt.toISOString(),
		})),
	};
}

async function enviarPorCanal(canal: string, idExterno: string, texto: string): Promise<void> {
	if (canal === "telegram") await telegram.enviarMensaje(idExterno, texto);
	else if (canal === "whatsapp") await whatsapp.enviarMensaje(idExterno, texto);
	else throw new ClienteError(400, `Canal desconocido: ${canal}`);
}

/**
 * Send a reply as yourself. Auto-takeover: replying while the bot still owns the thread IS taking
 * it over, whether or not the "Tomar control" button was clicked first — typing an answer and
 * having the bot also chime in on the same message would be a worse experience than just treating
 * the reply as the handoff.
 */
export async function enviarMensajeHumano(input: { actor: Actor; conversacionId: string; texto: string }) {
	requireChat(input.actor);
	const texto = input.texto.trim();
	if (!texto) throw new ClienteError(400, "El mensaje no puede ir vacío");

	const conversacion = await prisma.canal_conversacion.findUnique({ where: { id: input.conversacionId } });
	if (!conversacion) throw new ClienteError(404, "Conversación no encontrada");

	await enviarPorCanal(conversacion.canal, conversacion.idExterno, texto);

	await prisma.$transaction([
		prisma.canal_mensaje.create({
			data: {
				id: randomUUID(),
				conversacionId: conversacion.id,
				direccion: "saliente",
				texto,
				autorId: input.actor.id,
			},
		}),
		prisma.canal_conversacion.update({
			where: { id: conversacion.id },
			data: {
				ultimoMensajeAt: new Date(),
				ultimoMensajeTexto: preview(texto),
				...(conversacion.modo !== "humano"
					? { modo: "humano", tomadaPorId: input.actor.id, tomadaAt: new Date() }
					: {}),
			},
		}),
	]);
}

export async function tomarControl(input: { actor: Actor; conversacionId: string }) {
	requireChat(input.actor);
	const conversacion = await prisma.canal_conversacion.findUnique({ where: { id: input.conversacionId } });
	if (!conversacion) throw new ClienteError(404, "Conversación no encontrada");

	await prisma.$transaction(async (tx) => {
		await tx.canal_conversacion.update({
			where: { id: conversacion.id },
			data: { modo: "humano", tomadaPorId: input.actor.id, tomadaAt: new Date() },
		});
		await recordAudit(tx, {
			action: "canal.conversacion_tomada",
			actor: input.actor,
			entityId: conversacion.id,
			summary: `${input.actor.name} tomó el control de la conversación de ${conversacion.canal}`,
		});
	});
}

export async function regresarBot(input: { actor: Actor; conversacionId: string }) {
	requireChat(input.actor);
	const conversacion = await prisma.canal_conversacion.findUnique({ where: { id: input.conversacionId } });
	if (!conversacion) throw new ClienteError(404, "Conversación no encontrada");

	await prisma.$transaction(async (tx) => {
		await tx.canal_conversacion.update({
			where: { id: conversacion.id },
			data: { modo: "bot", tomadaPorId: null, tomadaAt: null },
		});
		await recordAudit(tx, {
			action: "canal.conversacion_regresada",
			actor: input.actor,
			entityId: conversacion.id,
			summary: `${input.actor.name} regresó la conversación de ${conversacion.canal} al bot`,
		});
	});
}
