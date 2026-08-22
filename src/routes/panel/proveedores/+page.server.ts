import type { Actions, ServerLoad } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { conFlash } from "$lib/flash";
import { requirePermission, requireUser } from "$lib/server/guard";
import { crearProveedor, listProveedores } from "$lib/server/proveedores";
import { fallo } from "$lib/server/errores";

export const load: ServerLoad = async ({ locals, url }) => {
	requirePermission(locals, "proveedor:read");
	const q = url.searchParams.get("q");
	const proveedores = await listProveedores({ q });
	return { proveedores, q: q ?? "" };
};

export const actions: Actions = {
	crear: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			const proveedor = await crearProveedor({
				actor,
				body: {
					rfc: data.get("rfc"),
					nombre: data.get("nombre"),
					contacto: data.get("contacto"),
					telefono: data.get("telefono"),
					email: data.get("email"),
				},
			});
			redirect(303, conFlash(`/panel/proveedores/${proveedor.id}`, "proveedor.crear"));
		} catch (err) {
			return fallo(err);
		}
	},
};
