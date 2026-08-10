import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { CITA_ESTADOS, CITA_ESTADO_KEYS, CITA_TIPOS, CITA_TIPO_KEYS } from "$lib/citas";
import { conFlash } from "$lib/flash";
import { can } from "$lib/roles";
import {
	avanzarCita,
	cancelarCita,
	confirmarCita,
	datosParaVincular,
	listCitas,
	parseCitaQuery,
	vincularCita,
} from "$lib/server/citas";
import { requirePermission, requireUser } from "$lib/server/guard";
import { fallo } from "$lib/server/errores";

/**
 * The full appointment list: requests and booked appointments together, newest day first.
 * Same shared function the API route uses (Rule 4) — the filters are the API's query params.
 */
export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requirePermission(locals, "cita:read");
	const query = parseCitaQuery(url.searchParams, actor.id);
	const mias = url.searchParams.get("mias") === "1";

	// The board is the default: the daily question is "where is everything stuck", and a table
	// sorted by date cannot answer it. `?vista=tabla` is the way out, and it is what the paginated
	// long-range searches want.
	//
	// The board needs the whole pipeline at once or a column lies about being empty. A paginated
	// Kanban is a Kanban that hides work.
	const tablero = (url.searchParams.get("vista") ?? "tablero") !== "tabla";
	if (tablero) query.perPage = 200;

	const listado = await listCitas(query);

	// Dropping an unlinked request on Confirmada asks for the cliente and the unidad first —
	// vincular is a step of confirming, not an errand somebody has to go run on another screen.
	// Only loaded for the one card being moved: this is four queries, not a page's worth.
	const moviendo = listado.citas.find((c) => c.id === url.searchParams.get("mover")) ?? null;
	const clienteElegido = url.searchParams.get("cliente") ?? moviendo?.clienteId ?? null;
	const vincular =
		moviendo && !moviendo.vinculada && url.searchParams.get("a") === "confirmada" && can(actor.role, "cita:update")
			? await datosParaVincular(moviendo, clienteElegido)
			: null;

	return {
		...listado,
		vincular,
		clienteElegido,
		mias,
		tablero,
		vencidas: query.vencidas ?? false,
		filtros: {
			q: query.q ?? "",
			estado: query.estado ?? "",
			tipo: query.tipo ?? "",
			desde: query.desde ?? "",
			hasta: query.hasta ?? "",
		},
		// Board column order is the pipeline order, which is the order of the registry — not the
		// filter dropdown's alphabet. Terminal states sit at the end where work goes to rest.
		estados: CITA_ESTADO_KEYS.map((k) => ({ value: k, label: CITA_ESTADOS[k].label })),
		tipos: CITA_TIPO_KEYS.map((k) => ({ value: k, label: CITA_TIPOS[k].label })),
		// What the board may offer as a drop target. `puedeMoverCita` combines these with the row
		// itself; the server functions below re-check every one of them.
		actorId: actor.id,
		puede: {
			crear: can(actor.role, "cita:create"),
			avanzar: can(actor.role, "cita:advance"),
			cancelar: can(actor.role, "cita:cancel"),
			actualizar: can(actor.role, "cita:update"),
		},
	};
};

/**
 * Where to land after a move. The board carries its filters in the URL, and losing them would
 * throw the operator back to an unfiltered board on every card they touch — so the drawer posts
 * the view it came from. Validated as a local path: a form field is caller input.
 */
const volverA = (value: FormDataEntryValue | null): string => {
	const ruta = typeof value === "string" ? value : "";
	return ruta.startsWith("/panel/citas?") || ruta === "/panel/citas" ? ruta : "/panel/citas";
};

/**
 * Moving a card is the same three functions the detail screen calls (Rule 4) — the board is a
 * shortcut, not a second set of rules. Each one keeps whatever the move needs: cancelling its
 * reason, confirming its hour.
 */
export const actions: Actions = {
	avanzar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await avanzarCita({
				actor,
				id: String(data.get("id") ?? ""),
				estado: data.get("estado"),
				motivo: data.get("motivo"),
			});
		} catch (err) {
			return fallo(err);
		}
		redirect(303, conFlash(volverA(data.get("volver")), "cita.avanzar"));
	},

	/**
	 * Step one of confirming a request that has no cliente or unidad yet. It lands back on the
	 * board with `?mover=&a=confirmada` still set, so the drawer reopens on the hour — the move
	 * the operator started is the move they finish, without leaving the board.
	 */
	vincular: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		const id = String(data.get("id") ?? "");
		try {
			await vincularCita({ actor, id, body: Object.fromEntries(data) as Record<string, unknown> });
		} catch (err) {
			return fallo(err);
		}
		const destino = new URL(volverA(data.get("volver")), "http://x");
		destino.searchParams.set("mover", id);
		destino.searchParams.set("a", "confirmada");
		redirect(303, conFlash(destino.pathname + destino.search, "cita.vincular"));
	},

	confirmar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await confirmarCita({
				actor,
				id: String(data.get("id") ?? ""),
				body: { inicio: data.get("inicio") },
			});
		} catch (err) {
			return fallo(err);
		}
		redirect(303, conFlash(volverA(data.get("volver")), "cita.confirmar"));
	},

	cancelar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await cancelarCita({ actor, id: String(data.get("id") ?? ""), motivo: data.get("motivo") });
		} catch (err) {
			return fallo(err);
		}
		redirect(303, conFlash(volverA(data.get("volver")), "cita.cancelar"));
	},
};
