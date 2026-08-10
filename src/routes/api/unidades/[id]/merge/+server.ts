import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import {
	CAMPOS_FUSIONABLES_UNIDAD,
	mergeUnidades,
	publicUnidad,
	type CampoFusionableUnidad,
} from "$lib/server/unidades";

/**
 * POST /api/unidades/:id/merge — fold a duplicate vehicle record into `:id`.
 * Body: { duplicadoId, motivo, camposElegidos?: Record<campo, "keeper"|"duplicado"> }
 *
 * Permission: `unidad:merge` (Admin only). `:id` is always the keeper — everything the
 * duplicate had (notas, citas, kilometraje, per-unit pickup authorizations) moves to it, and
 * the duplicate is archived, never deleted. See `mergeUnidades`.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	if (typeof body.duplicadoId !== "string" || !body.duplicadoId) {
		error(400, "Se requiere `duplicadoId`");
	}

	try {
		const duplicado = await mergeUnidades({
			actor,
			keeperId: params.id!,
			duplicadoId: body.duplicadoId,
			motivo: body.motivo,
			camposElegidos:
				body.camposElegidos && typeof body.camposElegidos === "object"
					? (Object.fromEntries(
							CAMPOS_FUSIONABLES_UNIDAD.filter((c) => body.camposElegidos[c] === "duplicado").map((c) => [
								c,
								"duplicado",
							]),
						) as Partial<Record<CampoFusionableUnidad, "duplicado">>)
					: undefined,
		});
		return json({ duplicado: publicUnidad(duplicado) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
