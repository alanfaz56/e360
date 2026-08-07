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
