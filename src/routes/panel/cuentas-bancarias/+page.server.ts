import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { conFlash } from "$lib/flash";
import { requirePermission, requireUser } from "$lib/server/guard";
import {
	actualizarCuentaBancaria,
	archivarCuentaBancaria,
	crearCuentaBancaria,
	listCuentasBancarias,
} from "$lib/server/cuentas-bancarias";
import { fallo } from "$lib/server/errores";

export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requirePermission(locals, "cuenta_bancaria:manage");
	const archivadas = url.searchParams.get("archivadas") === "1";
	return {
		cuentas: await listCuentasBancarias(actor, { archivadas }),
		filtros: { archivadas },
	};
};

export const actions: Actions = {
	crear: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await crearCuentaBancaria({ actor, body });
			redirect(303, conFlash("/panel/cuentas-bancarias", "cuentaBancaria.crear"));
		} catch (err) {
			return fallo(err, { valores: body });
		}
	},

	editar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		const body = Object.fromEntries(data) as Record<string, unknown>;
		body.principal = data.get("principal") !== null;
		try {
			await actualizarCuentaBancaria({ actor, id: String(data.get("id")), body });
			redirect(303, conFlash("/panel/cuentas-bancarias", "cuentaBancaria.editar"));
		} catch (err) {
			return fallo(err, { valores: body });
		}
	},

	archivar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await archivarCuentaBancaria({ actor, id: String(data.get("id")), archivada: true });
			redirect(303, conFlash("/panel/cuentas-bancarias", "cuentaBancaria.archivar"));
		} catch (err) {
			return fallo(err);
		}
	},

	restaurar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await archivarCuentaBancaria({ actor, id: String(data.get("id")), archivada: false });
			redirect(303, conFlash("/panel/cuentas-bancarias", "cuentaBancaria.restaurar"));
		} catch (err) {
			return fallo(err);
		}
	},
};
