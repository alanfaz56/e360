import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { conFlash } from "$lib/flash";
import { requirePermission, requireUser } from "$lib/server/guard";
import { guardarEmpresa, obtenerEmpresa } from "$lib/server/empresa";
import { fallo } from "$lib/server/errores";

/** Estación 360's own phone/site. Admin/Gerente — see roles.ts for why this is not `requireDueno`. */
export const load: ServerLoad = async ({ locals }) => {
	requirePermission(locals, "empresa:manage");
	return { empresa: await obtenerEmpresa() };
};

export const actions: Actions = {
	guardar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await guardarEmpresa({ actor, body });
			redirect(303, conFlash("/panel/empresa", "empresa.guardar"));
		} catch (err) {
			return fallo(err, { valores: { telefono: body.telefono, sitioWeb: body.sitioWeb } });
		}
	},
};
