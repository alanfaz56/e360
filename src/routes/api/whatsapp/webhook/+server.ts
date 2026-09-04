import { randomUUID } from "node:crypto";
import { error, json, text, type RequestHandler } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import * as booking from "$lib/server/canales/conversacion";
import * as chat from "$lib/server/canales/chat";
import {
	aEnvioMx,
	enviarMensaje,
	esFirmaValida,
	extraerMensajes,
	verificarHandshake,
	whatsappConfigurado,
	type WaBoton,
	type WhatsAppContacto,
	type WhatsAppMensaje,
	type WhatsAppWebhookBody,
} from "$lib/server/canales/whatsapp";
import { solicitarCitaPorCanal, vincularCitaPorCanal } from "$lib/server/citas";
import { ClienteError } from "$lib/server/clientes";
import { clientePorCanal, redimirVerificacion, verificacionPendiente } from "$lib/server/canales/verificacionCliente";

const CANAL = "whatsapp" as const;

/**
 * GET /api/whatsapp/webhook — Meta's one-time handshake when the URL is registered in the app
 * dashboard. Telegram has no equivalent; WhatsApp's webhook route is the only one that answers GET.
 */
export const GET: RequestHandler = async ({ url }) => {
	const challenge = await verificarHandshake({
		mode: url.searchParams.get("hub.mode"),
		token: url.searchParams.get("hub.verify_token"),
		challenge: url.searchParams.get("hub.challenge"),
	});
	if (!challenge) error(403, "Verificación fallida");
	return text(challenge);
};

/**
 * POST /api/whatsapp/webhook — Meta calls this on every inbound message. ANONYMOUS by definition,
 * same shape as the Telegram webhook: a signature gate, then straight into the real domain
 * functions. Always answers 200 once past the gate, even on a business error — Meta retries a
 * non-2xx delivery.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!(await whatsappConfigurado())) error(503, "WhatsApp no está configurado");

	// Signature is computed over the RAW body — parsing first and re-serializing would not
	// reproduce the same bytes Meta signed.
	const crudo = await request.text();
	if (!(await esFirmaValida(crudo, request.headers.get("x-hub-signature-256")))) error(401, "Firma inválida");

	const body = JSON.parse(crudo) as WhatsAppWebhookBody;
	const mensajes = extraerMensajes(body);

	for (const { mensaje, contacto } of mensajes) {
		const eventoId = await marcarVisto(mensaje.id, mensaje.from);
		if (!eventoId) continue; // Meta retried a delivery we already processed.

		try {
			await procesarMensaje(mensaje, contacto);
			await prisma.canal_evento.update({ where: { id: eventoId }, data: { procesadoAt: new Date() } });
		} catch (err) {
			console.error("whatsapp webhook:", err);
			await prisma.canal_evento
				.update({
					where: { id: eventoId },
					data: { procesadoAt: new Date(), error: err instanceof Error ? err.message : String(err) },
				})
				.catch(() => {});
		}
	}

	return json({ ok: true });
};

async function marcarVisto(eventoExternoId: string, idExterno: string): Promise<string | null> {
	try {
		const fila = await prisma.canal_evento.create({
			data: { id: randomUUID(), canal: CANAL, eventoExternoId, idExterno, tipo: "update" },
		});
		return fila.id;
	} catch {
		// Unique violation on (canal, eventoExternoId).
		return null;
	}
}

async function procesarMensaje(mensaje: WhatsAppMensaje, contacto: WhatsAppContacto | null) {
	const from = mensaje.from;
	const texto = mensaje.type === "text" ? (mensaje.text?.body ?? "").trim() : "";
	const boton = mensaje.type === "interactive" ? mensaje.interactive?.button_reply?.id : undefined;

	// A button tap has no free text of its own — the button's label is what the human-takeover
	// chat should show, not the opaque callback id.
	const botonTitulo = mensaje.interactive?.button_reply?.title;
	const { conversacionId, modo } = await chat.registrarMensajeEntrante({
		canal: CANAL,
		idExterno: from,
		texto: (boton ? botonTitulo : texto) || "(mensaje no compatible: usa texto)",
		nombreCanal: contacto?.profile?.name,
	});

	// A human already has this thread — the bot stays quiet so the two never talk over each other.
	if (modo !== "bot") return;

	await continuarFlujo(from, conversacionId, { texto, boton });
}

/**
 * Does this message look like a verification code rather than a booking answer? Mirrors
 * `generarCodigoLegible` in `verificacionCliente.ts`: exactly 6 characters from an alphabet with
 * no 0/O/1/I. Only used to decide whether to TRY redeeming mid-booking — a false positive costs
 * one failed lookup and falls through to the booking step, never an error to the customer.
 */
const pareceCodigo = (texto: string) => /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(texto);

/** Booking's own `resumen()` step formats with Telegram's `<b>` HTML — WhatsApp uses `*bold*`. */
function htmlAWhatsapp(texto: string): string {
	return texto
		.replace(/<b>/g, "*")
		.replace(/<\/b>/g, "*")
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">");
}

const aBotonesWa = (botones: { texto: string; callback: string }[]): WaBoton[] =>
	// Strips a leading emoji — Telegram reads better with one inline, a tappable WhatsApp button
	// does not need it and every character counts against the 20-char title cap.
	botones.map((b) => ({ id: b.callback, titulo: b.texto.replace(/^\p{Extended_Pictographic}️?\s*/u, "") }));

/**
 * The only thing this bot does on WhatsApp today: book a cita. Reuses the exact same
 * `conversacion.ts` state machine Telegram's booking flow drives — this function only adapts its
 * generic `{pregunta,completo,cancelado}` shape to WhatsApp's send format (buttons, `*bold*`).
 * No `/start`, no staff commands: those are the Telegram-linked-employee surface (see
 * `.issues/whatsapp-telegram-integracion.md`), a different trust model WhatsApp never gets.
 */
async function continuarFlujo(from: string, conversacionId: string, entrada: { texto?: string; boton?: string }) {
	const responder = async (mensajeTexto: string, botones?: WaBoton[]) => {
		await enviarMensaje(from, mensajeTexto, botones);
		await chat.registrarMensajeBot(conversacionId, mensajeTexto);
	};

	// A staff-sent verification code may be outstanding for this number. An IN-PROGRESS BOOKING
	// WINS: eating every message as a code attempt while somebody is mid-booking traps them in a
	// loop for the code's whole TTL — `avanzar` never runs, so not even "cancelar" gets them out.
	// Mid-booking, only something actually SHAPED like a code is treated as one, and a failed
	// redemption falls through to the booking rather than answering "no reconozco ese código".
	const bookingActivo = await booking.enProgreso(CANAL, from);
	if (await verificacionPendiente(CANAL, from)) {
		const codigo = (entrada.texto ?? "").trim().toUpperCase();
		if (!bookingActivo || pareceCodigo(codigo)) {
			const resultado = await redimirVerificacion({ canal: CANAL, idExterno: from, codigo });
			if (resultado) {
				await responder(`¡Listo! Tu número quedó verificado, ${resultado.clienteNombre}.`);
				return;
			}
			// Never leaks WHICH check failed (bad code vs. expired vs. wrong number) — see
			// verificacionCliente.ts. Only says so when there's no booking to fall through to.
			if (!bookingActivo) {
				await responder("No reconozco ese código. Verifica que sea el que te enviamos e inténtalo de nuevo.");
				return;
			}
		}
	}

	if (!bookingActivo) {
		const cliente = await clientePorCanal(CANAL, from);
		if (cliente) {
			await booking.iniciarBooking(CANAL, from, {
				telefono: cliente.telefono ?? aEnvioMx(from),
				verificado: { nombre: cliente.nombreCompleto, clienteId: cliente.id },
			});
			await responder(`Hola 👋 ¿Eres ${cliente.nombreCompleto}?`, [
				{ id: "cita:verificar:si", titulo: "✅ Sí" },
				{ id: "cita:verificar:no", titulo: "No" },
			]);
		} else {
			// WhatsApp always knows the sender's number — only Telegram's own booking start
			// (a separate call site, not this one) ever needs to ask for it. `aEnvioMx` strips
			// Meta's wa_id "1" — the cita's `telefono` should read like a real number, not Meta's
			// wire form of one.
			await booking.iniciarBooking(CANAL, from, { telefono: aEnvioMx(from) });
			await responder("Hola 👋 Soy el asistente de Estación 360. Te ayudo a agendar una cita. ¿Cuál es tu nombre?");
		}
		return;
	}

	// `avanzar` commits the next step before we get a chance to send the question. If the send
	// then fails, the customer is advanced past a question they never saw — and `canal_evento`'s
	// dedupe means Meta's retry never re-delivers it. Snapshot first, put it back on failure, and
	// their next message simply re-runs the step.
	const previo = await booking.instantanea(CANAL, from);
	const paso = await booking.avanzar(CANAL, from, entrada);

	if (paso.tipo === "cancelado") {
		await responder("Listo, lo dejamos aquí. Escríbenos cuando quieras agendar.");
		return;
	}
	if (paso.tipo === "pregunta") {
		try {
			await responder(
				paso.html ? htmlAWhatsapp(paso.texto) : paso.texto,
				paso.botones ? aBotonesWa(paso.botones) : undefined,
			);
		} catch (err) {
			await booking.restaurar(CANAL, from, previo);
			throw err;
		}
		return;
	}

	// paso.tipo === "completo"
	try {
		const cita = await solicitarCitaPorCanal(paso.body, CANAL, conversacionId);
		const cliente = await clientePorCanal(CANAL, from);
		// The cita is real either way — a failure here is a missed convenience, not a reason to
		// tell the customer their request didn't go through.
		if (cliente) {
			await vincularCitaPorCanal(cita.id, cliente.id, paso.unidadId || undefined).catch((err) =>
				console.error("vincularCitaPorCanal:", err),
			);
		}
		await responder(
			`✅ ¡Listo! Tu solicitud quedó registrada con el folio #${cita.folio}. Te confirmamos por teléfono en cuanto la revisemos.`,
		);
	} catch (err) {
		await responder(
			err instanceof ClienteError
				? `No pude agendar: ${err.message}. Escríbenos para intentar de nuevo.`
				: "Algo falló al agendar. Intenta de nuevo en un momento.",
		);
	}
}
