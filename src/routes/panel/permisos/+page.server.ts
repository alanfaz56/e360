import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { conFlash } from "$lib/flash";
import { ROLES } from "$lib/roles";
import { requirePermission, requireUser } from "$lib/server/guard";
import { actualizarPermisosMasivo, listPermisos } from "$lib/server/permisos";
import { fallo } from "$lib/server/errores";

export const load: ServerLoad = async ({ locals }) => {
	const actor = requirePermission(locals, "permisos:manage");
	return { filas: await listPermisos(actor), roles: ROLES };
};

export const actions: Actions = {
	/**
	 * One bulk save, not one POST per checkbox — ~80 keys × 4 roles is a grid, and the person
	 * editing it is making one decision at a time ("Operador can close notas too"), not 300.
	 * `actualizarPermisosMasivo` diffs against what's live and only writes what actually changed.
	 */
	guardar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();

		const filas = await listPermisos(actor);
		const cambios = filas.flatMap((f) =>
			ROLES.map((rol) => ({
				permiso: f.permiso,
				rol,
				otorgado: data.get(`perm__${f.permiso}__${rol}`) === "1",
			})),
		);

		try {
			await actualizarPermisosMasivo({ actor, cambios });
			redirect(303, conFlash("/panel/permisos", "permisos.guardar"));
		} catch (err) {
			return fallo(err);
		}
	},
};
