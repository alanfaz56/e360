import { auth } from "$lib/auth";
import { MENSAJE_INTERNO, esErrorDeUsuario, registrarFalla } from "$lib/server/errores";
import { asegurarPermisosCache } from "$lib/server/permisos";
import type { Handle, HandleServerError } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
	// `can()` reads a synchronous in-memory cache (see roles.ts) so hundreds of call sites never
	// had to become async; this is the one place that cache gets warmed from the database. A
	// no-op on every request but the first per instance and once an hour after — see the TTL in
	// server/permisos.ts.
	await asegurarPermisosCache();

	const session = await auth.api.getSession({
		headers: event.request.headers,
	});

	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	return resolve(event);
};

/**
 * The backstop: anything that escapes a load, an endpoint or an action lands here.
 *
 * Without it SvelteKit answers a bare English "Internal Error", and in dev it renders the stack —
 * so this is both the "say something readable" half and the "never leak the schema" half. The real
 * error goes to the log against a reference the user can read back over the phone.
 *
 * `esErrorDeUsuario` is the exception: those messages were written in Spanish to be shown.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	// 404s and the other framework-generated statuses are not failures worth a reference number.
	if (status !== 500) return { message };

	if (esErrorDeUsuario(error)) return { message: error.message };

	const ref = registrarFalla(error, `${event.request.method} ${event.url.pathname}`);
	return { message: `${MENSAJE_INTERNO}. Referencia ${ref}.`, ref };
};
