import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { NOTA_ESTADOS, NOTA_ESTADO_KEYS, pasoParaMoverNota } from "$lib/notas";
import { conFlash } from "$lib/flash";
import { can } from "$lib/roles";
import { requirePermission, requireUser } from "$lib/server/guard";
import { listContactos } from "$lib/server/contactos";
import { listTalleres } from "$lib/server/talleres";
import {
	avanzarNota,
	cancelarNota,
	entregarNota,
	listNotas,
	parseNotaQuery,
	transferirNota,
} from "$lib/server/notas";
import { fallo } from "$lib/server/errores";

/** The service-note list: everything currently in the shop, plus history. */
export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requirePermission(locals, "nota:read");
	const query = parseNotaQuery(url.searchParams);

	// The board is the default, same as citas: "where is every vehicle stuck" is the question asked
	// twenty times a day, and a table sorted by date cannot answer it. `?vista=tabla` opts out and
	// is what the paginated, long-range searches want.
	//
	// It needs the whole filtered pipeline at once or a column lies about being empty — a paginated
	// Kanban is a Kanban that hides work.
	const tablero = (url.searchParams.get("vista") ?? "tablero") !== "tabla";
	if (tablero) query.perPage = 200;

	const listado = await listNotas(query);

	const puede = {
		crear: can(actor.role, "nota:create"),
		avanzar: can(actor.role, "nota:advance"),
		cancelar: can(actor.role, "nota:cancel"),
		entregar: can(actor.role, "nota:close"),
		transferir: can(actor.role, "nota:transfer"),
	};

	// Dropping a card opens the confirmation for that move; it never writes on release. Whatever
	// that move needs (a taller, who received the unit) is loaded ONLY for the one card being
	// moved — this is at most one extra query, not a page's worth.
	const moviendo = listado.notas.find((n) => n.id === url.searchParams.get("mover")) ?? null;
	const aEstado = url.searchParams.get("a");
	const paso = moviendo && aEstado ? pasoParaMoverNota(aEstado) : null;

	const [talleres, entregadores] = await Promise.all([
		paso === "transferir" && can(actor.role, "taller:read")
			? (await listTalleres({ perPage: 100 })).talleres.filter((t) => !t.archivado)
			: [],
		paso === "entregar" && moviendo
			? (await listContactos(moviendo.clienteId))
					.filter((c) => c.roles.includes("entregador"))
					.map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono }))
			: [],
	]);

	return {
		...listado,
		tablero,
		talleres,
		entregadores,
		filtros: {
			q: query.q ?? "",
			estado: query.estado ?? "",
			abiertas: query.abiertas ?? false,
		},
		// Column order is the pipeline order — the registry's order, not the filter's alphabet.
		estados: NOTA_ESTADO_KEYS.map((k) => ({ value: k, label: NOTA_ESTADOS[k].label })),
		puede,
	};
};

/**
 * Where to land after a move. The board carries its filters in the URL, and losing them would
 * throw the operator back to an unfiltered board on every card they touch — so the drawer posts
 * the view it came from. Validated as a local path: a form field is caller input.
 */
const volverA = (value: FormDataEntryValue | null): string => {
	const ruta = typeof value === "string" ? value : "";
	return ruta.startsWith("/panel/notas?") || ruta === "/panel/notas" ? ruta : "/panel/notas";
};

/**
 * Moving a card is the same four functions the detail screen calls (Rule 4) — the board is a
 * shortcut, not a second set of rules. Each keeps whatever its move needs: cancelling its reason,
 * entregar who received it, transferir the taller and reason.
 */
export const actions: Actions = {
	avanzar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await avanzarNota({ actor, id: String(data.get("id") ?? ""), estado: data.get("estado") });
		} catch (err) {
			return fallo(err);
		}
		redirect(303, conFlash(volverA(data.get("volver")), "nota.avanzar"));
	},

	transferir: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await transferirNota({
				actor,
				id: String(data.get("id") ?? ""),
				tallerId: data.get("tallerId"),
				motivo: data.get("motivo"),
			});
		} catch (err) {
			return fallo(err);
		}
		redirect(303, conFlash(volverA(data.get("volver")), "nota.transferir"));
	},

	entregar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await entregarNota({
				actor,
				id: String(data.get("id") ?? ""),
				contactoId: data.get("contactoId"),
				observaciones: data.get("observaciones"),
			});
		} catch (err) {
			return fallo(err);
		}
		redirect(303, conFlash(volverA(data.get("volver")), "nota.entregar"));
	},

	cancelar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await cancelarNota({ actor, id: String(data.get("id") ?? ""), motivo: data.get("motivo") });
		} catch (err) {
			return fallo(err);
		}
		redirect(303, conFlash(volverA(data.get("volver")), "nota.cancelar"));
	},
};
