import type { Actions, ServerLoad } from "@sveltejs/kit";
import { conFlash } from "$lib/flash";
import { redirect } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { asignarTaller, editarProveedor, getProveedor, listComprasDeProveedor, quitarTaller } from "$lib/server/proveedores";
import { listTalleres } from "$lib/server/talleres";
import { fallo } from "$lib/server/errores";

export const load: ServerLoad = async ({ locals, params }) => {
	const actor = requirePermission(locals, "proveedor:read");
	const [proveedor, compras, talleres] = await Promise.all([
		getProveedor(params.id!),
		listComprasDeProveedor(params.id!),
		listTalleres({}, actor),
	]);
	return { proveedor, compras, talleres: talleres.talleres };
};

export const actions: Actions = {
	editar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await editarProveedor({
				actor,
				id: params.id!,
				body: {
					nombre: data.get("nombre"),
					contacto: data.get("contacto"),
					telefono: data.get("telefono"),
					email: data.get("email"),
				},
			});
			redirect(303, conFlash(`/panel/proveedores/${params.id}`, "proveedor.editar"));
		} catch (err) {
			return fallo(err);
		}
	},

	asignarTaller: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			const tallerId = String(data.get("tallerId") ?? "");
			await asignarTaller({ actor, proveedorId: params.id!, tallerId });
			redirect(303, conFlash(`/panel/proveedores/${params.id}`, "proveedor.asignarTaller"));
		} catch (err) {
			return fallo(err);
		}
	},

	quitarTaller: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			const tallerId = String(data.get("tallerId") ?? "");
			await quitarTaller({ actor, proveedorId: params.id!, tallerId });
			redirect(303, conFlash(`/panel/proveedores/${params.id}`, "proveedor.quitarTaller"));
		} catch (err) {
			return fallo(err);
		}
	},
};
