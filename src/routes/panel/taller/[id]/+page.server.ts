import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { conFlash } from "$lib/flash";
import { requirePermission, requireUser } from "$lib/server/guard";
import { capturarDiagnostico, comentarNota, getNotaDeTaller } from "$lib/server/notas";
import { solicitarRefaccion } from "$lib/server/inventario";
import { buscarParaTaller } from "$lib/server/productos";
import { r2Configurado } from "$lib/server/r2";
import { fallaEnCarga, fallo } from "$lib/server/errores";

/**
 * One job, as the mechanic works it.
 *
 * `getNotaDeTaller` carries the ownership check: a mechanic gets a 404 for a note that is not
 * theirs — 404 and not 403, so probing ids cannot confirm somebody else's job exists.
 *
 * Every action here is a real form action calling the same shared functions the API routes call,
 * so the whole screen works with JavaScript off. Only photo upload needs JS, because it goes
 * straight to R2 from the browser.
 */
export const load: ServerLoad = async ({ locals, params, url }) => {
	const actor = requirePermission(locals, "nota:asignadas");

	try {
		const detalle = await getNotaDeTaller(actor, params.id!);
		// Only when the parts drawer is open: the list view pays nothing for it.
		const buscando = url.searchParams.get("drawer") === "refaccion";
		return {
			...detalle,
			productos: buscando ? await buscarParaTaller(url.searchParams.get("q")) : [],
			q: url.searchParams.get("q") ?? "",
			r2: r2Configurado(),
		};
	} catch (err) {
		fallaEnCarga(err);
	}
};

const problema = (err: unknown) => {
	return fallo(err);
};

export const actions: Actions = {
	diagnostico: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await capturarDiagnostico({
				actor,
				id: params.id!,
				diagnostico: data.get("diagnostico"),
				// The button carries the intent: "Guardar" saves, "Terminé" also closes the work.
				terminado: data.get("terminado") === "1" ? true : data.get("terminado") === "0" ? false : undefined,
			});
			redirect(303, conFlash(`/panel/taller/${params.id}`, "nota.diagnostico"));
		} catch (err) {
			return fallo(err);
		}
	},

	refaccion: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await solicitarRefaccion({ actor, notaId: params.id!, body });
			redirect(303, conFlash(`/panel/taller/${params.id}`, "inventario.solicitud"));
		} catch (err) {
			return fallo(err);
		}
	},

	comentar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			// `comentarNota` FORCES interno for a mechanic; the form does not offer the choice, and
			// the server would ignore it if it did.
			await comentarNota({ actor, id: params.id!, texto: data.get("texto"), interno: true });
			redirect(303, conFlash(`/panel/taller/${params.id}`, "nota.comentar"));
		} catch (err) {
			return fallo(err);
		}
	},
};
