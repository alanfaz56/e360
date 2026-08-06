import type { ServerLoad } from "@sveltejs/kit";
import { NOTA_ESTADOS, NOTA_ESTADO_KEYS } from "$lib/notas";
import { can } from "$lib/roles";
import { requirePermission } from "$lib/server/guard";
import { listNotas, parseNotaQuery } from "$lib/server/notas";

/** The service-note list: everything currently in the shop, plus history. */
export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requirePermission(locals, "nota:read");
	const query = parseNotaQuery(url.searchParams);

	return {
		...(await listNotas(query)),
		filtros: {
			q: query.q ?? "",
			estado: query.estado ?? "",
			abiertas: query.abiertas ?? false,
		},
		estados: NOTA_ESTADO_KEYS.map((k) => ({ value: k, label: NOTA_ESTADOS[k].label })),
		puede: { crear: can(actor.role, "nota:create") },
	};
};
