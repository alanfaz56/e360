import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { GRUPOS, GRUPO_KEYS } from "$lib/ajustes";
import { PROVEEDOR_DEFAULT, PROVEEDORES } from "$lib/server/pac";
import { conFlash } from "$lib/flash";
import { guardarAjustes, leerAjustes, puedeGuardarSecretos } from "$lib/server/ajustes";
import { fallaEnCarga, fallo } from "$lib/server/errores";
import { requireDueno, requireUser } from "$lib/server/guard";
import { usoDeTimbrado } from "$lib/server/timbrado";

/**
 * System settings. Gated by `requireDueno`, which answers 404 to anybody who is not on the
 * `OWNER_EMAILS` list — including an Admin. The shop's own Admin manages the shop; the
 * credentials that stamp CFDIs in our name are not part of that job.
 */
export const load: ServerLoad = async ({ locals, url }) => {
	requireDueno(locals, "ajustes:read");

	try {
		// Usage over a window, defaulting to the current month — which is how a PAC bills.
		const dias = Number(url.searchParams.get("dias")) || 30;
		const desde = new Date(Date.now() - dias * 86_400_000);

		const [ajustes, uso] = await Promise.all([leerAjustes(), usoDeTimbrado(desde)]);

		return {
			ajustes,
			uso,
			dias,
			grupos: GRUPO_KEYS.map((k) => ({ clave: k, ...GRUPOS[k] })),
			// Without `AJUSTES_SECRET_KEY` no credential can be stored at all, and the screen has to
			// say so up front instead of failing on save.
			puedeGuardarSecretos: puedeGuardarSecretos(),
			proveedores: Object.values(PROVEEDORES).map((p) => ({ clave: p.clave, label: p.label })),
			proveedorActivo: PROVEEDOR_DEFAULT,
		};
	} catch (err) {
		fallaEnCarga(err);
	}
};

export const actions: Actions = {
	guardar: async ({ locals, request }) => {
		// Re-checked here and not inherited from the load: an action is its own entry point.
		requireDueno(locals, "ajustes:manage");
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;

		try {
			await guardarAjustes({ actor, body });
		} catch (err) {
			return fallo(err);
		}
		redirect(303, conFlash("/panel/ajustes", "ajuste.guardar"));
	},
};
