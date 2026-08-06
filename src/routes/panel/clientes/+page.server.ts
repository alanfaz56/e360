import { fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { conFlash } from "$lib/flash";
import { can } from "$lib/roles";
import { requirePermission, requireUser } from "$lib/server/guard";
import {
	CLIENTE_TIPOS,
	CLIENTE_TIPO_LABEL,
	ClienteError,
	createCliente,
	listClientes,
	parseClienteQuery,
} from "$lib/server/clientes";

export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requirePermission(locals, "cliente:read");
	const query = parseClienteQuery(url.searchParams);

	return {
		...(await listClientes(query)),
		filtros: { q: query.q ?? "", tipo: query.tipo ?? "", archivados: query.archivados ?? false },
		tipos: CLIENTE_TIPOS.map((value) => ({ value, label: CLIENTE_TIPO_LABEL[value] })),
		puede: { crear: can(actor.role, "cliente:create") },
	};
};

export const actions: Actions = {
	/** Same rules as POST /api/clientes — both call `createCliente`. */
	crear: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const form = await request.formData();
		const body = Object.fromEntries(form) as Record<string, unknown>;

		try {
			const cliente = await createCliente({ actor, body });
			redirect(303, conFlash(`/panel/clientes/${cliente.id}`, "cliente.crear"));
		} catch (err) {
			if (err instanceof ClienteError) return fail(err.status, { message: err.message });
			throw err;
		}
	},
};
