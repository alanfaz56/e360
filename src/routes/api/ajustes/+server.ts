import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { guardarAjustes, leerAjustes } from "$lib/server/ajustes";
import { requireDueno } from "$lib/server/guard";

/**
 * GET /api/ajustes — every setting in the catalogue, with its definition.
 *
 * `requireDueno`: the permission AND the `OWNER_EMAILS` list, and it answers **404** to anyone
 * else. A 403 would confirm the endpoint exists and that somebody can read the PAC's credentials
 * through it; there is no reason for an account that cannot use it to learn that.
 *
 * **A secret's value is never in the response** — `leerAjustes` returns a hint (`••••1234`) and an
 * empty value. That is a property of the mapper, not of this route remembering to strip it.
 */
export const GET: RequestHandler = async ({ locals }) => {
	requireDueno(locals, "ajustes:read");
	return json({ ajustes: await leerAjustes() });
};

/**
 * PATCH /api/ajustes — save some of them. Permission: `ajustes:manage` + owner.
 *
 * Body is `{ "<clave>": "<valor>" }`. Two rules worth knowing before integrating:
 *
 * - An unregistered key is ignored, never stored. The catalogue in `$lib/ajustes` is the contract.
 * - **A secret sent empty means "leave it alone", not "erase it".** The screen cannot show a
 *   stored secret, so an untouched field posts empty; treating that as a delete would wipe the
 *   credentials every time somebody changed an unrelated dropdown. Clearing one is explicit:
 *   `{ "facturacion.apiKey__borrar": "1" }`.
 */
export const PATCH: RequestHandler = async ({ locals, request }) => {
	const actor = requireDueno(locals, "ajustes:manage");
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const { guardados } = await guardarAjustes({ actor, body });
		return json({ guardados, ajustes: await leerAjustes() });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
