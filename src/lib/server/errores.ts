/**
 * The server half of "what a failure is allowed to say". The rules themselves, and the sentences,
 * live in [$lib/errores](../errores.ts) — pure and pinned by `check-errores.ts`. This adds what
 * only the server can do: turn a thrown value into a `fail()` or an `error()`, and put the real
 * one in the log against a reference.
 *
 * `ClienteError` / `InviteError` / `UserError` are the deliberate exception to rule 2: they are
 * *written* for the person reading them, in Spanish, and carry the HTTP status the route answers.
 * Everything else is ours, not theirs.
 */
import { error, fail, isHttpError, isRedirect, type ActionFailure } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { conReferencia } from "$lib/errores";
import { ClienteError } from "./clientes";
import { InviteError } from "./invitations";
import { UserError } from "./users";

export { MENSAJE_INTERNO } from "$lib/errores";

/**
 * An error whose message was written to be shown. All three classes predate this file and each
 * carries `status` + `message`; they are listed rather than duck-typed so that a random object
 * with a `.status` can never smuggle its own text onto the screen.
 */
export function esErrorDeUsuario(err: unknown): err is { status: number; message: string } {
	return err instanceof ClienteError || err instanceof InviteError || err instanceof UserError;
}

/**
 * Record something unexpected and return the reference the user is given.
 *
 * Short and typo-proof on purpose: it gets read out over the phone ("me salió el 4F2A91"), so it
 * is uppercase hex with no ambiguous characters beyond what hex already avoids.
 */
export function registrarFalla(err: unknown, contexto?: string): string {
	const ref = randomUUID().slice(0, 6).toUpperCase();
	console.error(`[falla ${ref}]${contexto ? ` ${contexto}` : ""}`, err);
	return ref;
}

/** The Spanish sentence for any thrown value. Never the thrown value's own message. */
export function mensajeDeError(err: unknown, contexto?: string): string {
	if (esErrorDeUsuario(err)) return err.message;
	return conReferencia(registrarFalla(err, contexto));
}

/**
 * EVERY form action's catch block. One line at each call site, so "what does the user see when
 * this breaks" stops being a per-route decision — eighty hand-written catches was eighty chances
 * to forget one, and the ones that forgot ended in a full-page 500 that threw away the form.
 *
 * `extra` carries whatever the page needs to re-render: the values the user typed, mostly.
 *
 *     } catch (err) {
 *         return fallo(err);
 *     }
 */
// Two overloads rather than one optional generic: with `extra` omitted the inferred `T` widens to
// an index signature, which poisons every page's `ActionData` union. Spelling both shapes out keeps
// `form.valores` typed where it is passed and `form.message` alone where it is not.
export function fallo(err: unknown): ActionFailure<{ message: string }>;
export function fallo<T extends Record<string, unknown>>(
	err: unknown,
	extra: T,
): ActionFailure<T & { message: string }>;
export function fallo(err: unknown, extra?: Record<string, unknown>) {
	// `redirect()` and `error()` throw. They are control flow, not failures — swallowing a redirect
	// would quietly turn every successful action into one that appears to do nothing.
	if (isRedirect(err) || isHttpError(err)) throw err;

	const status = esErrorDeUsuario(err) ? err.status : 500;
	return fail(status, { ...extra, message: mensajeDeError(err) });
}

/**
 * The same decision for a `load`, which cannot return a `fail` — there is no form to come back to,
 * so the page becomes the error screen and the message it shows is the one chosen here.
 */
export function fallaEnCarga(err: unknown): never {
	if (isRedirect(err) || isHttpError(err)) throw err;
	error(esErrorDeUsuario(err) ? err.status : 500, mensajeDeError(err));
}
