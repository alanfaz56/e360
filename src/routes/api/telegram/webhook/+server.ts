import { randomUUID } from "node:crypto";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import * as booking from "$lib/server/canales/conversacion";
import { actorPorCanal, redimirVinculacion } from "$lib/server/canales/identidad";
import {
	enviarMensaje,
	esSecretoValido,
	responderCallback,
	telegramConfigurado,
	type TelegramMessage,
	type TelegramUpdate,
} from "$lib/server/canales/telegram";
import { solicitarCitaPorCanal } from "$lib/server/citas";
import { ClienteError } from "$lib/server/clientes";
import { NotaError, comentarNota, notaPorFolio } from "$lib/server/notas";

const CANAL = "telegram" as const;

const MENU_INICIAL = [{ texto: "📅 Agendar una cita", callback: "menu:cita" }];

/**
 * POST /api/telegram/webhook — Telegram calls this on every message/button tap. ANONYMOUS by
 * definition (it's the whole internet, filtered by the secret header below), same shape as
 * POST /api/citas/solicitudes: a gate, then straight into the real domain functions.
 *
 * Always answers 200 once past the gate, even on a business error — Telegram retries a
 * non-2xx delivery, and a typo in a chat is not something worth retrying.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!(await telegramConfigurado())) error(503, "Telegram no está configurado");

	const header = request.headers.get("x-telegram-bot-api-secret-token");
	if (!(await esSecretoValido(header))) error(401, "Firma inválida");

	const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
	if (!update) return json({ ok: true });

	const chatId = String(
		update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? update.callback_query?.from.id ?? "",
	);

	// Telegram retries a delivery it didn't get a fast enough 200 for. Claiming the update_id
	// first means a retry of the same update is a no-op, not a second booking or a second reply.
	const eventoId = await marcarVisto(update.update_id, chatId);
	if (!eventoId) return json({ ok: true });

	try {
		if (update.callback_query) await manejarCallback(update.callback_query);
		else if (update.message) await manejarMensaje(update.message);
		await prisma.canal_evento.update({ where: { id: eventoId }, data: { procesadoAt: new Date() } });
	} catch (err) {
		console.error("telegram webhook:", err);
		await prisma.canal_evento
			.update({
				where: { id: eventoId },
				data: { procesadoAt: new Date(), error: err instanceof Error ? err.message : String(err) },
			})
			.catch(() => {});
	}

	return json({ ok: true });
};

/** Returns the new row's id, or `null` if this exact update was already processed (retry). */
async function marcarVisto(updateId: number, idExterno: string): Promise<string | null> {
	try {
		const fila = await prisma.canal_evento.create({
			data: {
				id: randomUUID(),
				canal: CANAL,
				eventoExternoId: String(updateId),
				idExterno,
				tipo: "update",
			},
		});
		return fila.id;
	} catch {
		// Unique violation on (canal, eventoExternoId).
		return null;
	}
}

async function manejarCallback(cb: NonNullable<TelegramUpdate["callback_query"]>) {
	const chatId = String(cb.message?.chat.id ?? cb.from.id);
	await responderCallback(cb.id);

	if (cb.data === "menu:cita") {
		await booking.iniciarBooking(CANAL, chatId);
		await enviarMensaje(chatId, "¿Cuál es tu nombre?");
		return;
	}

	if (cb.data?.startsWith("cita:")) {
		await continuarBooking(chatId, { boton: cb.data });
	}
}

async function manejarMensaje(msg: TelegramMessage) {
	const chatId = String(msg.chat.id);
	const texto = (msg.text ?? "").trim();

	if (msg.contact) {
		// Sharing a phone number is not handled yet — booking asks for one as plain text, which
		// works with or without this button. Reserved for the customer-linking follow-up.
		return;
	}

	if (texto === "/start") {
		const actor = await actorPorCanal(CANAL, chatId);
		await booking.cancelar(CANAL, chatId);
		const saludo = actor
			? `Hola ${actor.name.split(" ")[0]}, tu cuenta ya está vinculada. Puedes usar /comentar (folio) (mensaje) para comentar una nota, o agendar una cita abajo.`
			: "Hola 👋 Soy el asistente de Estación 360. Puedo ayudarte a agendar una cita. Si trabajas aquí, vincula tu cuenta con /vincular (código) (lo generas desde el panel).";
		await enviarMensaje(chatId, saludo, { botones: MENU_INICIAL });
		return;
	}

	if (texto.startsWith("/vincular")) {
		const codigo = texto.split(/\s+/)[1];
		if (!codigo) {
			await enviarMensaje(chatId, "Manda el código junto con el comando, ej. /vincular ABC123");
			return;
		}
		try {
			const { nombre } = await redimirVinculacion({ canal: CANAL, idExterno: chatId, nombreCanal: msg.from?.username, codigo });
			await enviarMensaje(chatId, `Listo, ${nombre.split(" ")[0]} — tu Telegram quedó vinculado a tu cuenta.`);
		} catch (err) {
			await enviarMensaje(chatId, err instanceof ClienteError ? err.message : "No pude vincular tu cuenta.");
		}
		return;
	}

	if (texto.startsWith("/comentar")) {
		await comentar(chatId, texto);
		return;
	}

	if (await booking.enProgreso(CANAL, chatId)) {
		await continuarBooking(chatId, { texto });
		return;
	}

	await enviarMensaje(chatId, "No entendí ese mensaje. Usa /start para ver las opciones.");
}

async function continuarBooking(chatId: string, entrada: { texto?: string; boton?: string }) {
	const paso = await booking.avanzar(CANAL, chatId, entrada);

	if (paso.tipo === "cancelado") {
		await enviarMensaje(chatId, "Listo, lo dejamos aquí. Escribe /start si quieres empezar de nuevo.");
		return;
	}
	if (paso.tipo === "pregunta") {
		await enviarMensaje(chatId, paso.texto, { botones: paso.botones, html: paso.html });
		return;
	}

	// paso.tipo === "completo"
	try {
		const cita = await solicitarCitaPorCanal(paso.body, CANAL);
		await enviarMensaje(
			chatId,
			`✅ ¡Listo! Tu solicitud quedó registrada con el folio #${cita.folio}. Te confirmamos por teléfono en cuanto la revisemos.`,
		);
	} catch (err) {
		await enviarMensaje(
			chatId,
			err instanceof ClienteError
				? `No pude agendar: ${err.message}. Escribe /start para intentar de nuevo.`
				: "Algo falló al agendar. Intenta de nuevo con /start.",
		);
	}
}

/** `/comentar <folio> <texto…>` — only reachable once the chat is linked to a real user. */
async function comentar(chatId: string, texto: string) {
	const actor = await actorPorCanal(CANAL, chatId);
	if (!actor) {
		await enviarMensaje(chatId, "Necesitas vincular tu cuenta primero: /vincular (código).");
		return;
	}
	if (!can(actor.role, "nota:comment")) {
		await enviarMensaje(chatId, "Tu cuenta no tiene permiso para comentar notas.");
		return;
	}

	const match = /^\/comentar\s+(\d+)\s+([\s\S]+)$/.exec(texto);
	if (!match) {
		await enviarMensaje(chatId, "Formato: /comentar (folio) (tu comentario). Ej. /comentar 482 ya está lista");
		return;
	}

	try {
		const nota = await notaPorFolio(Number(match[1]));
		await comentarNota({ actor, id: nota.id, texto: match[2] });
		await enviarMensaje(chatId, `Comentario agregado a la nota #${match[1]}.`);
	} catch (err) {
		await enviarMensaje(chatId, err instanceof NotaError ? err.message : "No pude agregar el comentario.");
	}
}
