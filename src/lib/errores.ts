/**
 * What a failure is allowed to SAY. Pure, browser-safe, no runes — so `check-errores.ts` can pin
 * it, which is the point: this is the file that decides whether an internal message ever reaches a
 * screen, and a rule nothing checks is a rule that drifts.
 *
 * Two rules, pulling against each other:
 *
 * 1. **Nothing fails silently.** Every failure reaches the person who caused it. A caught exception
 *    that ends in a `console.error` and a page that looks unchanged is the worst outcome in the
 *    app — the user believes the write happened.
 * 2. **The user never reads an internal error.** A driver message names columns, constraints and
 *    connection strings; a browser message is English written for whoever builds browsers. Neither
 *    tells anybody here what to do, and the first tells an attacker about the schema.
 *
 * The one exception is a message somebody WROTE to be shown — `ErrorVisible` on the client and
 * `ClienteError` and friends on the server. Those are already Spanish, already for this screen.
 */

/** What a user is told when the cause is ours. The reference is what makes the log findable. */
export const MENSAJE_INTERNO = "Algo falló de nuestro lado y ya quedó registrado";

export const conReferencia = (ref: string) => `${MENSAJE_INTERNO}. Referencia ${ref}.`;

/** Throw this when the message was already written for the person who will read it. */
export class ErrorVisible extends Error {
	override name = "ErrorVisible";
}

/**
 * The sentence for an HTTP status when the response carried no message of its own.
 *
 * `alternativa` says what was being attempted ("No pudimos buscar clientes."), because "error 500"
 * is not something anybody can act on and "algo falló" without a subject is barely better.
 */
export function mensajePorEstado(status: number, alternativa: string): string {
	if (status === 401 || status === 403) return "Tu sesión ya no tiene permiso para eso. Vuelve a entrar.";
	if (status === 404) return `${alternativa} No encontramos lo que buscabas.`;
	if (status === 429) return "Demasiadas peticiones seguidas. Espera un momento e inténtalo otra vez.";
	if (status >= 500) return `${alternativa} Es un problema nuestro, no tuyo.`;
	return alternativa;
}

/**
 * Undo double-encoded UTF-8 — "facturaciÃ³n" back into "facturación".
 *
 * Some services encode their text as UTF-8 twice, so the bytes that arrive already spell the
 * mojibake and decoding them correctly cannot help: `ó` (C3 B3) went out as `Ã³` (C3 83 C2 B3).
 * The fix is to read each character back as one byte and decode THAT as UTF-8.
 *
 * Two guards, because running this on clean text would corrupt it:
 *
 * - Only when the tell-tale `Ã`/`Â` + continuation-byte pair is present.
 * - `fatal: true`, so text that was not actually double-encoded throws and is left alone.
 */
export function repararMojibake(texto: string): string {
	// U+00C3 (Ã) or U+00C2 (Â) followed by a UTF-8 continuation byte read as latin-1. Written
	// as escapes so the pattern cannot itself be mangled by an editor re-saving this file.
	if (!/[ÃÂ][-¿]/.test(texto)) return texto;
	// A character above 255 means this is not a latin-1-shaped string, so the premise does not hold.
	for (const ch of texto) if (ch.codePointAt(0)! > 0xff) return texto;

	try {
		const bytes = Uint8Array.from(texto, (c) => c.charCodeAt(0));
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return texto;
	}
}

/**
 * A message from an outside service, reduced to plain text.
 *
 * Third parties write their errors for their own web UI, so they arrive with markup in them —
 * factura.com answers things like `<strong>No puedes facturar 2</strong>, necesitas agregar…`.
 * Rendered escaped that shows the tags to the user; rendered with `{@html}` it would be an
 * injection point in every screen that reports a failure. Neither is acceptable, so the tags come
 * off here, once, before the message is ever stored or shown.
 *
 * Not a general HTML parser and not trying to be — this is a sanitizer whose output is text, so
 * anything it fails to recognise stays harmlessly literal.
 */
export function soloTexto(mensaje: string): string {
	return repararMojibake(mensaje)
		.replace(/<br\s*\/?>/gi, " ")
		.replace(/<\/(p|div|li|h[1-6])>/gi, " ")
		.replace(/<[^>]*>/g, "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#0?39;|&apos;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * A thrown value turned into something a person can read. **Never `err.message`** unless the error
 * says its message is safe to show.
 */
export function mensajeDeExcepcion(err: unknown, alternativa: string): string {
	// A failed `fetch` throws a TypeError whose message names neither the cause nor a fix.
	if (err instanceof TypeError) return "Sin conexión con el servidor. Revisa tu internet e inténtalo otra vez.";
	// Checked by `name`, not by `instanceof`: the class crosses module and bundle boundaries, and
	// an identity check there fails silently in exactly the case this exists for.
	if (err instanceof Error && err.name === "ErrorVisible") return err.message;
	return alternativa;
}
