import type { ServerLoad } from "@sveltejs/kit";
import { NOTA_ESTADOS, NOTA_ESTADO_KEYS } from "$lib/notas";
import { can } from "$lib/roles";
import { requirePermission } from "$lib/server/guard";
import { listNotas, parseNotaQuery } from "$lib/server/notas";

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

	return {
		...(await listNotas(query)),
		tablero,
		filtros: {
			q: query.q ?? "",
			estado: query.estado ?? "",
			abiertas: query.abiertas ?? false,
		},
		// Column order is the pipeline order — the registry's order, not the filter's alphabet.
		// Terminal estados sit at the end, where work goes to rest.
		estados: NOTA_ESTADO_KEYS.map((k) => ({ value: k, label: NOTA_ESTADOS[k].label })),
		puede: { crear: can(actor.role, "nota:create") },
	};
};
