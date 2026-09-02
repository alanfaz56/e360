import { randomUUID } from "node:crypto";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { formatoPesos } from "$lib/comercial";
import { RANGO_OPCIONES } from "$lib/dashboard-constantes";
import { esMimePermitido, limiteDeTipo, megas, tipoDeMime } from "$lib/notas";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import * as chat from "$lib/server/canales/chat";
import * as booking from "$lib/server/canales/conversacion";
import { actorPorCanal, redimirVinculacion } from "$lib/server/canales/identidad";
import * as notasFlujo from "$lib/server/canales/notas-flujo";
import {
	descargarArchivo,
	enviarMensaje as enviarMensajeApi,
	esSecretoValido,
	responderCallback,
	telegramConfigurado,
	type TelegramMessage,
	type TelegramUpdate,
} from "$lib/server/canales/telegram";
import { solicitarCitaPorCanal } from "$lib/server/citas";
import { ClienteError } from "$lib/server/clientes";
import { type Periodo, periodoAnterior, resolverPeriodo } from "$lib/server/dashboard-periodo";
import { getDashboardResumen } from "$lib/server/dashboard/resumen";
import { NotaError, comentarNota, listNotas, misNotas, notaPorFolio, registrarEvidencia } from "$lib/server/notas";
import { firmarSubida } from "$lib/server/r2";
import type { Actor } from "$lib/server/guard";

const CANAL = "telegram" as const;

const MENU_INICIAL = [{ texto: "📅 Agendar una cita", callback: "menu:cita" }];

/**
 * Sends the bot's reply and records it in the shared chat log (`/panel/chat`), mirroring the
 * WhatsApp webhook. Shadows the raw API call so every existing `enviarMensaje(...)` call site
 * below logs for free — none of them need to know about `canal_conversacion`.
 */
async function enviarMensaje(
	chatId: string,
	texto: string,
	opciones?: Parameters<typeof enviarMensajeApi>[2],
): Promise<void> {
	await enviarMensajeApi(chatId, texto, opciones);
	await chat.registrarMensajeBotPorExterno(CANAL, chatId, texto);
}

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

	const { modo } = await chat.registrarMensajeEntrante({
		canal: CANAL,
		idExterno: chatId,
		texto: cb.data ? `(botón) ${cb.data}` : "(botón)",
		nombreCanal: cb.from.username,
	});
	if (modo !== "bot") return; // human already has this thread — stay quiet, just recorded above

	if (cb.data === "menu:cita") {
		await booking.iniciarBooking(CANAL, chatId);
		await enviarMensaje(chatId, "¿Cuál es tu nombre?");
		return;
	}

	if (cb.data?.startsWith("cita:")) {
		await continuarBooking(chatId, { boton: cb.data });
		return;
	}

	if (cb.data?.startsWith("nota:")) {
		await manejarNotaCallback(chatId, cb.data);
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

	const { modo } = await chat.registrarMensajeEntrante({
		canal: CANAL,
		idExterno: chatId,
		texto: texto || "(mensaje no compatible: usa texto)",
		nombreCanal: msg.from?.username,
	});
	if (modo !== "bot") return; // human already has this thread — stay quiet, just recorded above

	if (texto === "/start") {
		const actor = await actorPorCanal(CANAL, chatId);
		await booking.cancelar(CANAL, chatId);
		await notasFlujo.cancelar(CANAL, chatId);
		const saludo = actor
			? `Hola ${actor.name.split(" ")[0]}, tu cuenta ya está vinculada. Usa /notas para ver tus notas y agregar comentarios o evidencia${can(actor.role, "dashboard:ver") ? ", /reporte para el resumen del negocio" : ""}, o /comentar (folio) (mensaje) directo. También puedes agendar una cita abajo.`
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

	if (texto === "/reporte" || texto.startsWith("/reporte ")) {
		await reporte(chatId, texto);
		return;
	}

	if (texto === "/notas") {
		await listarNotas(chatId);
		return;
	}

	if (await notasFlujo.enProgreso(CANAL, chatId)) {
		await continuarNotaFlujo(chatId, msg);
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

const RANGO_LABEL = Object.fromEntries(RANGO_OPCIONES.map((o) => [o.value, o.label])) as Record<string, string>;

/** Up/down arrow + the improvement verdict — same reading as the dashboard's own trend chips. */
function flecha(v: { pct: number | null; mejora: boolean | null }): string {
	if (v.pct === null) return "";
	const signo = v.pct > 0 ? "+" : "";
	return ` (${signo}${v.pct}%${v.mejora === null ? "" : v.mejora ? " ✅" : " ⚠️"})`;
}

function formatearReporte(periodo: Periodo, r: Awaited<ReturnType<typeof getDashboardResumen>>): string {
	return [
		`<b>📊 Reporte — ${RANGO_LABEL[periodo.rango] ?? periodo.rango}</b>`,
		"",
		`💰 Ventas: ${formatoPesos(r.ventas.valor)}${flecha(r.ventas.var)}`,
		`📈 Utilidad: ${formatoPesos(r.utilidad.valor)}${flecha(r.utilidad.var)}`,
		`📐 Margen: ${r.margen.valor !== null ? r.margen.valor + "%" : "—"}${flecha(r.margen.var)}`,
		`🔧 Trabajos abiertos: ${r.trabajosAbiertos.valor}${flecha(r.trabajosAbiertos.var)}`,
		`🧾 Ticket promedio: ${r.ticketPromedio.valor !== null ? formatoPesos(r.ticketPromedio.valor) : "—"}${flecha(r.ticketPromedio.var)}`,
		`⏳ Por cobrar: ${formatoPesos(r.porCobrar)}`,
		`🔴 Vencido: ${formatoPesos(r.vencido)}`,
	].join("\n");
}

/** `/reporte [rango]` — admin/gerente only. `rango` is one of the dashboard's own values (hoy,
 *  semana, mes, 30d, anio); an unknown or missing one falls back to the dashboard's default. */
async function reporte(chatId: string, texto: string) {
	const actor = await actorPorCanal(CANAL, chatId);
	if (!actor) {
		await enviarMensaje(chatId, "Necesitas vincular tu cuenta primero: /vincular (código).");
		return;
	}
	if (!can(actor.role, "dashboard:ver")) {
		await enviarMensaje(chatId, "Tu cuenta no tiene permiso para ver reportes.");
		return;
	}

	const rangoArg = texto.split(/\s+/)[1];
	const periodo = resolverPeriodo(new URLSearchParams(rangoArg ? { rango: rangoArg } : {}));
	const resumen = await getDashboardResumen(periodo, periodoAnterior(periodo));
	await enviarMensaje(chatId, formatearReporte(periodo, resumen), { html: true });
}

/** `/notas` — lists open notas as buttons. Scope follows `nota:read`: the office sees the shop's
 *  open notas, a mechanic without it sees only the ones `alcanceDeTaller` gives them. */
async function listarNotas(chatId: string) {
	const actor = await actorPorCanal(CANAL, chatId);
	if (!actor) {
		await enviarMensaje(chatId, "Necesitas vincular tu cuenta primero: /vincular (código).");
		return;
	}
	if (!can(actor.role, "nota:comment") && !can(actor.role, "nota:evidencia")) {
		await enviarMensaje(chatId, "Tu cuenta no tiene permiso para ver notas.");
		return;
	}

	const items = can(actor.role, "nota:read")
		? (await listNotas({ abiertas: true, perPage: 8 })).notas.map((n) => ({
				folio: n.folio,
				etiqueta: `#${n.folio} · ${n.clienteNombre ?? n.unidadEtiqueta ?? n.estadoLabel}`,
			}))
		: (await misNotas(actor)).slice(0, 8).map((n) => ({
				folio: n.folio,
				etiqueta: `#${n.folio} · ${n.unidad ?? n.estadoLabel}`,
			}));

	if (items.length === 0) {
		await enviarMensaje(chatId, "No hay notas abiertas en este momento.");
		return;
	}

	await enviarMensaje(chatId, "Elige una nota:", {
		botones: items.map((n) => ({ texto: n.etiqueta.slice(0, 60), callback: `nota:pick:${n.folio}` })),
	});
}

async function manejarNotaCallback(chatId: string, data: string) {
	const actor = await actorPorCanal(CANAL, chatId);
	if (!actor) return; // a chat with no linked account never gets a `nota:` button in the first place

	if (data.startsWith("nota:pick:")) {
		const folio = Number(data.slice("nota:pick:".length));
		try {
			// `notaPorFolio` only resolves an id — it leaks nothing. The actual ownership check
			// happens where it always has: inside `comentarNota`/`registrarEvidencia` when this
			// picks lands, via `exigirNotaPropia`. A crafted folio just 404s there.
			const nota = await notaPorFolio(folio);
			await notasFlujo.iniciarAccion(CANAL, chatId, folio, nota.id);
			await enviarMensaje(chatId, `Nota #${folio}. ¿Qué quieres hacer?`, {
				botones: [
					{ texto: "💬 Comentar", callback: "nota:accion:comentario" },
					{ texto: "📷 Evidencia", callback: "nota:accion:evidencia" },
					{ texto: "✖️ Cancelar", callback: "nota:cancelar" },
				],
			});
		} catch (err) {
			await enviarMensaje(chatId, err instanceof ClienteError ? err.message : "No encontré esa nota.");
		}
		return;
	}

	if (data === "nota:accion:comentario" || data === "nota:accion:evidencia") {
		const accion = data === "nota:accion:comentario" ? "comentario" : "evidencia";
		const estado = await notasFlujo.elegir(CANAL, chatId, accion);
		if (!estado) {
			await enviarMensaje(chatId, "Ese botón ya venció. Escribe /notas para empezar de nuevo.");
			return;
		}
		await enviarMensaje(
			chatId,
			accion === "comentario"
				? `Escribe tu comentario para la nota #${estado.folio}:`
				: `Manda la foto o el archivo para la nota #${estado.folio} (agrega una descripción como texto del mensaje si quieres):`,
		);
		return;
	}

	if (data === "nota:cancelar") {
		await notasFlujo.cancelar(CANAL, chatId);
		await enviarMensaje(chatId, "Cancelado.");
	}
}

async function continuarNotaFlujo(chatId: string, msg: TelegramMessage) {
	const estado = await notasFlujo.estadoActual(CANAL, chatId);
	if (!estado) return;

	const texto = (msg.text ?? "").trim();
	if (texto.toLowerCase() === "cancelar") {
		await notasFlujo.cancelar(CANAL, chatId);
		await enviarMensaje(chatId, "Listo, cancelado.");
		return;
	}

	if (estado.paso === "accion") {
		await enviarMensaje(chatId, "Usa los botones de arriba, o escribe cancelar.");
		return;
	}

	const actor = await actorPorCanal(CANAL, chatId);
	if (!actor) {
		await notasFlujo.cancelar(CANAL, chatId);
		return;
	}

	if (estado.paso === "comentario") {
		if (!texto) {
			await enviarMensaje(chatId, "Mándame el texto del comentario, o escribe cancelar.");
			return;
		}
		await notasFlujo.cancelar(CANAL, chatId);
		try {
			await comentarNota({ actor, id: estado.notaId, texto });
			await enviarMensaje(chatId, `Comentario agregado a la nota #${estado.folio}.`);
		} catch (err) {
			await enviarMensaje(chatId, err instanceof NotaError ? err.message : "No pude agregar el comentario.");
		}
		return;
	}

	// estado.paso === "evidencia"
	const archivo = msg.photo?.at(-1) ?? msg.document;
	if (!archivo) {
		await enviarMensaje(chatId, "Mándame la foto o el archivo como adjunto, o escribe cancelar.");
		return;
	}
	await notasFlujo.cancelar(CANAL, chatId);
	try {
		await subirEvidenciaDesdeTelegram({
			actor,
			notaId: estado.notaId,
			archivo,
			esFoto: !!msg.photo,
			descripcion: msg.caption,
		});
		await enviarMensaje(chatId, `Evidencia agregada a la nota #${estado.folio}.`);
	} catch (err) {
		await enviarMensaje(chatId, err instanceof ClienteError ? err.message : "No pude subir la evidencia.");
	}
}

/**
 * Bridges a Telegram photo/document into the same evidence pipeline the panel uses: sign an
 * upload for this note, PUT the downloaded bytes straight to R2, then register the row.
 *
 * Category defaults to "otra" — asking the shop to classify a phone photo mid-chat is friction
 * the panel already handles better; whoever reviews it can recategorize there.
 */
async function subirEvidenciaDesdeTelegram(input: {
	actor: Actor;
	notaId: string;
	archivo: { file_id: string; file_name?: string; mime_type?: string };
	esFoto: boolean;
	descripcion?: string;
}) {
	const contentType = input.esFoto ? "image/jpeg" : (input.archivo.mime_type ?? "");
	if (!esMimePermitido(contentType)) {
		throw new ClienteError(400, "Ese tipo de archivo no se acepta. Manda una foto, PDF, audio o video.");
	}

	const firma = firmarSubida({
		carpeta: `notas/${input.notaId}`,
		nombreOriginal: input.archivo.file_name ?? `telegram-${Date.now()}.jpg`,
	});
	if (!firma) {
		throw new ClienteError(503, "El almacenamiento de fotos no está configurado todavía. Avisa a un administrador.");
	}

	const bytes = await descargarArchivo(input.archivo.file_id);
	const limite = limiteDeTipo(tipoDeMime(contentType));
	if (bytes.byteLength > limite) throw new ClienteError(413, `El archivo pasa de ${megas(limite)} MB`);

	const subida = await fetch(firma.url, {
		method: "PUT",
		body: Buffer.from(bytes),
		headers: { "Content-Type": contentType },
	});
	if (!subida.ok) throw new ClienteError(502, "No pude subir el archivo al almacenamiento.");

	await registrarEvidencia({
		actor: input.actor,
		id: input.notaId,
		body: {
			clave: firma.clave,
			categoria: "otra",
			contentType,
			nombre: input.archivo.file_name ?? "telegram.jpg",
			bytes: bytes.byteLength,
			descripcion: input.descripcion,
		},
	});
}
