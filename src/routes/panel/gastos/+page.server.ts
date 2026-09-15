import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { conFlash } from "$lib/flash";
import { requirePermission, requireUser } from "$lib/server/guard";
import { can } from "$lib/roles";
import {
	archivarGasto,
	archivarPlantilla,
	asegurarDraftsDelPeriodo,
	confirmarGastoPendiente,
	crearCategoria,
	crearGasto,
	crearPlantilla,
	listarCategorias,
	listarGastos,
	listarPlantillas,
	parseGastoQuery,
} from "$lib/server/gastos";
import { fallo } from "$lib/server/errores";

export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requirePermission(locals, "gasto:read");
	await asegurarDraftsDelPeriodo(actor);

	const [{ gastos, ...paging }, categorias, plantillas] = await Promise.all([
		listarGastos(actor, parseGastoQuery(url.searchParams)),
		listarCategorias(actor),
		listarPlantillas(actor),
	]);

	return {
		gastos,
		paging,
		categorias,
		plantillas,
		puedeAdministrar: can(actor.role, "gasto:manage"),
	};
};

export const actions: Actions = {
	crear: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await crearGasto(actor, body);
			redirect(303, conFlash("/panel/gastos", "gasto.crear"));
		} catch (err) {
			return fallo(err, { valores: body });
		}
	},

	confirmar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await confirmarGastoPendiente(actor, String(data.get("id")), data.get("monto") ?? undefined);
			redirect(303, conFlash("/panel/gastos", "gasto.confirmar"));
		} catch (err) {
			return fallo(err);
		}
	},

	archivar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await archivarGasto(actor, String(data.get("id")));
			redirect(303, conFlash("/panel/gastos", "gasto.archivar"));
		} catch (err) {
			return fallo(err);
		}
	},

	crearCategoria: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await crearCategoria(actor, body);
			redirect(303, conFlash("/panel/gastos", "gastoCategoria.crear"));
		} catch (err) {
			return fallo(err, { valores: body });
		}
	},

	crearPlantilla: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await crearPlantilla(actor, body);
			redirect(303, conFlash("/panel/gastos", "gastoPlantilla.crear"));
		} catch (err) {
			return fallo(err, { valores: body });
		}
	},

	archivarPlantilla: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await archivarPlantilla(actor, String(data.get("id")));
			redirect(303, conFlash("/panel/gastos", "gastoPlantilla.archivar"));
		} catch (err) {
			return fallo(err);
		}
	},
};
