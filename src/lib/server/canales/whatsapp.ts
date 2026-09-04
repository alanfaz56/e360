/**
 * WhatsApp Cloud API client (Meta). Thin — no business logic, no state — same split as
 * `canales/telegram.ts`.
 *
 * Credentials come from `ajustes` (`canales.whatsapp_*`), not env vars — same pattern as
 * Facturación/Correo/Telegram. See `src/lib/server/ajustes.ts`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { valorAjuste } from "$lib/server/ajustes";

const API_VERSION = "v21.0";
const API = `https://graph.facebook.com/${API_VERSION}`;

async function token(): Promise<string> {
	const t = await valorAjuste("canales.whatsapp_token");
	if (!t) throw new Error("canales.whatsapp_token no está configurado");
	return t;
}

async function phoneId(): Promise<string> {
	const id = await valorAjuste("canales.whatsapp_phone_id");
	if (!id) throw new Error("canales.whatsapp_phone_id no está configurado");
	return id;
}

/** True once a token and phone id are stored — the webhook route uses this to fail closed (503). */
export async function whatsappConfigurado(): Promise<boolean> {
	return (await valorAjuste("canales.whatsapp_token")) !== "" && (await valorAjuste("canales.whatsapp_phone_id")) !== "";
}

/**
 * The ONLY check that a webhook POST really came from Meta: `X-Hub-Signature-256`, an HMAC-SHA256
 * of the raw request body under the app secret. Must run against the RAW bytes, before JSON
 * parsing — a re-serialized body does not reproduce the same signature.
 *
 * Constant-time compare — same reasoning as `igualSeguro`'s own doc: this is a secret comparison.
 */
export async function esFirmaValida(cuerpoCrudo: string, headerRecibido: string | null): Promise<boolean> {
	const secreto = await valorAjuste("canales.whatsapp_app_secret");
	if (!secreto || !headerRecibido) return false;

	const esperada = "sha256=" + createHmac("sha256", secreto).update(cuerpoCrudo).digest("hex");
	const a = Buffer.from(esperada);
	const b = Buffer.from(headerRecibido);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

/** The GET handshake Meta sends once, when the webhook URL is registered in its dashboard. */
export async function verificarHandshake(params: {
	mode: string | null;
	token: string | null;
	challenge: string | null;
}): Promise<string | null> {
	if (params.mode !== "subscribe" || !params.challenge) return null;
	const esperado = await valorAjuste("canales.whatsapp_verify_token");
	if (!esperado || params.token !== esperado) return null;
	return params.challenge;
}

/**
 * Meta's own webhook reports an MX sender as "521XXXXXXXXXX" (wa_id form — country code "52"
 * plus a mobile "1" plus the 10-digit number), but that same "1" makes the Cloud API's send
 * endpoint reject the number with (#131030) "Recipient phone number not in allowed list" — the
 * allow-list (and, per Meta's own docs, normal delivery generally) wants "52XXXXXXXXXX", no "1".
 * Every reply path echoes `mensaje.from` straight back as `to`, so this has to be fixed once here
 * rather than at each call site. MX-only: this shop is Hermosillo-only (see CLAUDE.md).
 */
/**
 * Meta's own webhook reports an MX sender as "521XXXXXXXXXX" (wa_id form — country code "52"
 * plus a mobile "1" plus the 10-digit number), but that same "1" makes the Cloud API's send
 * endpoint reject the number with (#131030) "Recipient phone number not in allowed list" — the
 * allow-list (and, per Meta's own docs, normal delivery generally) wants "52XXXXXXXXXX", no "1".
 * Every reply path echoes `mensaje.from` straight back as `to`, so this has to be fixed once here
 * rather than at each call site.
 *
 * Exported because callers that store a `from`/wa_id as a customer-facing phone number (a cita's
 * own `telefono` field, say) need the same stripping — Meta's wire form is not what a human
 * should be handed back or asked to dial. Inverse of `aWaId` in `verificacionCliente.ts`, which
 * converts a stored number INTO wa_id form for lookups; the two are a pair, change them together.
 *
 * MX only — this shop is Hermosillo-only (see CLAUDE.md).
 */
export function aEnvioMx(to: string): string {
	const digitos = to.replace(/\D/g, "");
	if (digitos.startsWith("521") && digitos.length === 13) return "52" + digitos.slice(3);
	if (digitos.length === 10) return "52" + digitos;
	return to;
}

async function llamarMensajes(to: string, body: Record<string, unknown>): Promise<void> {
	const res = await fetch(`${API}/${await phoneId()}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
		body: JSON.stringify({ messaging_product: "whatsapp", to: aEnvioMx(to), ...body }),
	});
	const cuerpo = await res.text().catch(() => "");
	if (!res.ok) {
		console.error(`whatsapp enviarMensaje: ${res.status} a ${to}: ${cuerpo.slice(0, 500)}`);
		throw new Error(`WhatsApp sendMessage falló (${res.status}): ${cuerpo.slice(0, 300)}`);
	}
	// A 200 here only means Meta ACCEPTED the call — not that the phone received it. Log the
	// wamid/contacts so a "sent but never arrived" report can be traced in Meta's own dashboard
	// (usually a 24h-session-window or sandbox-tester-allowlist issue, not a bug in this code).
	console.log(`whatsapp enviarMensaje: 200 a ${to}: ${cuerpo.slice(0, 500)}`);
}

export type WaBoton = { id: string; titulo: string };

/**
 * Send a free-form text message, or — with `botones` — up to 3 tappable reply buttons (Cloud
 * API's `interactive`/`button` type). A button's `id` is what comes back verbatim in the next
 * inbound webhook (`interactive.button_reply.id`), same role Telegram's `callback_data` plays.
 *
 * Cloud API only allows either shape within 24h of the customer's last inbound message — outside
 * that window Meta rejects the call and a pre-approved Message Template is required instead (not
 * implemented here; see `.issues/whatsapp-telegram-integracion.md`). Callers surface that
 * rejection rather than this function pretending the window doesn't exist.
 */
export async function enviarMensaje(to: string, texto: string, botones?: WaBoton[]): Promise<void> {
	if (!botones?.length) {
		await llamarMensajes(to, { type: "text", text: { body: texto } });
		return;
	}
	await llamarMensajes(to, {
		type: "interactive",
		interactive: {
			type: "button",
			body: { text: texto },
			action: {
				// Title is capped at 20 chars by the API itself; truncating here turns a Meta 400
				// into a UI that just reads a little short instead of a failed send.
				buttons: botones
					.slice(0, 3)
					.map((b) => ({ type: "reply", reply: { id: b.id, title: b.titulo.slice(0, 20) } })),
			},
		},
	});
}

// --- The inbound shapes we actually read. Meta's webhook payload has far more than this; -------
// --- these are the fields this bot understands. Unknown shapes (statuses, reactions) are --------
// --- ignored, not errors. -------------------------------------------------------------------------

export type WhatsAppMensaje = {
	from: string;
	id: string;
	timestamp: string;
	type: string;
	text?: { body: string };
	interactive?: { type: string; button_reply?: { id: string; title: string } };
};

export type WhatsAppContacto = { wa_id: string; profile?: { name?: string } };

export type WhatsAppWebhookBody = {
	object?: string;
	entry?: {
		changes?: {
			field?: string;
			value?: {
				contacts?: WhatsAppContacto[];
				messages?: WhatsAppMensaje[];
			};
		}[];
	}[];
};

/** Flatten the nested entry/changes shape into the messages (+ matching contact) this app reads. */
export function extraerMensajes(
	body: WhatsAppWebhookBody,
): { mensaje: WhatsAppMensaje; contacto: WhatsAppContacto | null }[] {
	const salida: { mensaje: WhatsAppMensaje; contacto: WhatsAppContacto | null }[] = [];
	for (const entry of body.entry ?? []) {
		for (const change of entry.changes ?? []) {
			if (change.field !== "messages" || !change.value?.messages) continue;
			for (const mensaje of change.value.messages) {
				const contacto = change.value.contacts?.find((c) => c.wa_id === mensaje.from) ?? null;
				salida.push({ mensaje, contacto });
			}
		}
	}
	return salida;
}
