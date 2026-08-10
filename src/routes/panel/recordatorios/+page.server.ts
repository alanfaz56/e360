import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { conFlash } from "$lib/flash";
import { requirePermission, requireUser } from "$lib/server/guard";
import { crearRecordatorio, listRecordatorios, marcarRecordatorio, parseRecordatorioQuery } from "$lib/server/recordatorios";
import { fallo } from "$lib/server/errores";

/** Manual follow-ups, soonest first. Overdue ones are computed at read time, not stored. */
export const load: ServerLoad = async ({ locals, url }) => {
	requirePermission(locals, "recordatorio:manage");
	const query = parseRecordatorioQuery(url.searchParams);

	return {
		...(await listRecordatorios(query)),
		filtros: {
			vencidos: query.vencidos ?? false,
			hecho: query.hecho ?? false,
		},
	};
};

export const actions: Actions = {
	crear: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await crearRecordatorio({
				actor,
				unidadId: String(data.get("unidadId") ?? ""),
				body: { motivo: data.get("motivo"), fecha: data.get("fecha"), tipo: data.get("tipo") },
			});
			redirect(303, conFlash("/panel/recordatorios", "recordatorio.crear"));
		} catch (err) {
			return fallo(err);
		}
	},

	marcar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		const hecho = data.get("hecho") === "1";
		try {
			await marcarRecordatorio({ actor, id: String(data.get("id") ?? ""), hecho });
			redirect(303, conFlash("/panel/recordatorios", hecho ? "recordatorio.marcar" : "recordatorio.reabrir"));
		} catch (err) {
			return fallo(err);
		}
	},
};
