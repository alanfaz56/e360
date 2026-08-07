/**
 * The toast queue. One list, one place anything in the app says "this happened".
 *
 * Server-rendered results still arrive through `?ok=` and `form.message` (Rule 7 — the panel works
 * with JavaScript off); `Flash.svelte` hands those over to this store once it hydrates. What this
 * adds is a channel for the failures a form action cannot report because they never went through
 * one: a search request that 500s, an upload that R2 rejected, a push subscription that died.
 *
 * Those used to end as `resultados = []` or a `console.error`, which reads to the user as "nothing
 * happened" — the single thing they must never be left thinking.
 *
 * Safe to import from the browser. It IS the browser: pushing from server code does nothing.
 */
import { mensajePorEstado } from "./errores";

export type TonoToast = "ok" | "error";

export type Toast = {
	id: number;
	tono: TonoToast;
	mensaje: string;
	/** ms until it disappears on its own. `null` = never, it has to be dismissed. */
	vida: number | null;
};

/** A success is confirmation you already expected. A failure is news, and it waits to be read. */
const VIDA: Record<TonoToast, number | null> = { ok: 5000, error: null };

let siguienteId = 0;
const lista = $state<Toast[]>([]);

/**
 * Not exported as a bare array: a `$state` array loses its reactivity the moment it crosses a
 * module boundary by value, so readers go through the getter.
 */
export const toasts = {
	get lista() {
		return lista;
	},

	mostrar(mensaje: string, tono: TonoToast = "ok"): number {
		const limpio = mensaje.trim();
		if (!limpio) return -1;

		// The same failure repeated — a search retried three times against a service that is down —
		// is one piece of news, not three. Refresh the existing one instead of stacking copies.
		const repetido = lista.find((t) => t.mensaje === limpio && t.tono === tono);
		if (repetido) return repetido.id;

		const toast: Toast = { id: ++siguienteId, tono, mensaje: limpio, vida: VIDA[tono] };
		lista.push(toast);
		return toast.id;
	},

	/** Shorthand for the case this store exists for. */
	error(mensaje: string): number {
		return toasts.mostrar(mensaje, "error");
	},

	quitar(id: number): void {
		const i = lista.findIndex((t) => t.id === id);
		if (i !== -1) lista.splice(i, 1);
	},

	limpiar(): void {
		lista.length = 0;
	},
};

/**
 * What to SAY when a `fetch` from the browser fails.
 *
 * The endpoints answer `{ message }` in Spanish for anything the caller did wrong (Rule 4), so
 * that is what gets shown. Anything else — a 500, a dead network, HTML where JSON was expected —
 * falls back to `mensajePorEstado`, which never repeats what the server said.
 */
export async function mensajeDeRespuesta(res: Response, alternativa: string): Promise<string> {
	// A 500 answers with `handleError`'s generic sentence plus its reference, which IS meant to be
	// read. A 5xx that answers something else — a proxy's HTML, a gateway timeout — is not.
	try {
		const cuerpo = await res.json();
		if (typeof cuerpo?.message === "string" && cuerpo.message.trim()) return cuerpo.message;
	} catch {
		// Not JSON. Falls through — never surface the parse error itself.
	}
	return mensajePorEstado(res.status, alternativa);
}

// Re-exported so a component needs one import for "report this failure", not three.
export { ErrorVisible, mensajeDeExcepcion, mensajePorEstado } from "./errores";
