/**
 * Telegram Bot API client. Thin — no business logic, no state. Everything here is either an
 * outbound HTTP call or a piece of the inbound webhook contract.
 *
 * Credentials come from `ajustes` (`canales.telegram_bot_token` / `canales.telegram_webhook_secret`),
 * not env vars — same pattern as Facturación/Correo. See `src/lib/server/ajustes.ts`.
 */
import { valorAjuste } from "$lib/server/ajustes";
import { igualSeguro } from "$lib/server/cifrado";

const API = "https://api.telegram.org";

async function token(): Promise<string> {
	const t = await valorAjuste("canales.telegram_bot_token");
	if (!t) throw new Error("canales.telegram_bot_token no está configurado");
	return t;
}

/** True once a bot token is stored — the webhook route uses this to fail closed (503), not 500. */
export async function telegramConfigurado(): Promise<boolean> {
	return (await valorAjuste("canales.telegram_bot_token")) !== "";
}

/**
 * The ONLY check that a webhook POST really came from Telegram: it echoes back whatever
 * `secret_token` was passed to `setWebhook`, in this exact header, on every update.
 * Constant-time compare — this is a secret comparison, same reasoning as `igualSeguro`'s own doc.
 */
export async function esSecretoValido(headerRecibido: string | null): Promise<boolean> {
	const secreto = await valorAjuste("canales.telegram_webhook_secret");
	if (!secreto || !headerRecibido) return false;
	return igualSeguro(headerRecibido, secreto);
}

type TelegramResponse<T> = { ok: true; result: T } | { ok: false; description: string };

async function llamar<T>(metodo: string, body: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${API}/bot${await token()}/${metodo}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const data = (await res.json()) as TelegramResponse<T>;
	if (!data.ok) throw new Error(`Telegram ${metodo} falló: ${data.description}`);
	return data.result;
}

export type TecladoBoton = { texto: string; callback: string };

/**
 * Send a text message. `botones`, when given, renders as an inline keyboard (one button per
 * row — simplest layout, and every button we send so far reads better stacked than side by side).
 *
 * `html: true` turns on Telegram's HTML parse mode for `<b>`/`<i>` formatting — off by default
 * and only ever set by a caller that has run every interpolated value through `escapeHtml`
 * first. A stray `<código>`-style placeholder or an unescaped user-typed name/address is exactly
 * how a plain message silently fails to send: Telegram 400s the whole call on an unrecognized
 * tag, and there is no partial delivery to fall back on.
 */
export async function enviarMensaje(
	chatId: string,
	texto: string,
	opciones: { botones?: TecladoBoton[]; pedirContacto?: boolean; html?: boolean } = {},
): Promise<void> {
	const body: Record<string, unknown> = { chat_id: chatId, text: texto };
	if (opciones.html) body.parse_mode = "HTML";

	if (opciones.botones?.length) {
		body.reply_markup = {
			inline_keyboard: opciones.botones.map((b) => [{ text: b.texto, callback_data: b.callback }]),
		};
	} else if (opciones.pedirContacto) {
		// A "share phone" keyboard button. Telegram never exposes a number on its own — the person
		// has to tap this, which is also their consent to share it.
		body.reply_markup = {
			keyboard: [[{ text: "📱 Compartir mi teléfono", request_contact: true }]],
			resize_keyboard: true,
			one_time_keyboard: true,
		};
	} else {
		// Clear any keyboard left over from a previous step.
		body.reply_markup = { remove_keyboard: true };
	}

	await llamar("sendMessage", body);
}

/** Acknowledge an inline-button tap. Telegram shows a loading spinner on the button until this fires. */
export async function responderCallback(callbackQueryId: string, texto?: string): Promise<void> {
	await llamar("answerCallbackQuery", { callback_query_id: callbackQueryId, text: texto });
}

/** One-time setup call — see `scripts/telegram-set-webhook.ts`. Not called from request handling. */
export async function registrarWebhook(url: string): Promise<void> {
	const secreto = await valorAjuste("canales.telegram_webhook_secret");
	if (!secreto) throw new Error("canales.telegram_webhook_secret no está configurado");
	await llamar("setWebhook", { url, secret_token: secreto, allowed_updates: ["message", "callback_query"] });
}

export type TelegramWebhookInfo = {
	url: string;
	pendingUpdateCount: number;
	lastErrorDate: number | null;
	lastErrorMessage: string | null;
};

/**
 * What Telegram actually has on file right now — independent of what a deploy or a script
 * THINKS it set. `url: ""` means no webhook is registered at all. This is the only reliable way
 * to tell "nobody ever ran the setup step for this environment" apart from "it's registered but
 * failing", which is the exact ambiguity that makes a silent prod bot hard to diagnose.
 */
export async function obtenerInfoWebhook(): Promise<TelegramWebhookInfo> {
	const info = await llamar<{
		url: string;
		pending_update_count: number;
		last_error_date?: number;
		last_error_message?: string;
	}>("getWebhookInfo", {});
	return {
		url: info.url,
		pendingUpdateCount: info.pending_update_count,
		lastErrorDate: info.last_error_date ?? null,
		lastErrorMessage: info.last_error_message ?? null,
	};
}

/**
 * Download a photo or document the bot received, by its `file_id`. Just bytes — deciding the
 * content type, size limit and where it belongs (a note's evidence) is the caller's job, same
 * "thin client" boundary as everything else in this file.
 *
 * The Bot API caps a bot's own file downloads at 20 MB regardless of the file itself, so this
 * never needs a size check before fetching.
 */
export async function descargarArchivo(fileId: string): Promise<Uint8Array> {
	const { file_path } = await llamar<{ file_path?: string }>("getFile", { file_id: fileId });
	if (!file_path) throw new Error("Telegram no devolvió la ruta del archivo");

	const res = await fetch(`${API}/file/bot${await token()}/${file_path}`);
	if (!res.ok) throw new Error(`Telegram descarga de archivo falló: ${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
}

// --- The inbound shapes we actually read. Telegram's Update object has ~30 optional fields; -----
// --- these are the ones this bot understands. Unknown updates are ignored, not errors. ----------

export type TelegramUpdate = {
	update_id: number;
	message?: TelegramMessage;
	callback_query?: {
		id: string;
		data?: string;
		message?: { chat: { id: number } };
		from: TelegramUser;
	};
};

export type TelegramUser = { id: number; username?: string; first_name: string };

export type TelegramMessage = {
	message_id: number;
	chat: { id: number };
	from?: TelegramUser;
	text?: string;
	caption?: string;
	contact?: { phone_number: string; user_id?: number };
	/** Telegram re-encodes every photo into several sizes, smallest first — the last is the largest. */
	photo?: { file_id: string; file_size?: number }[];
	document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
};
