import type { ServerLoad } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";
import { listUnidades, parseUnidadQuery } from "$lib/server/unidades";

export const load: ServerLoad = async ({ locals, url }) => {
	requirePermission(locals, "unidad:read");
	const query = parseUnidadQuery(url.searchParams);

	return {
		...(await listUnidades(query)),
		filtros: { q: query.q ?? "", archivados: query.archivados ?? false },
	};
};
