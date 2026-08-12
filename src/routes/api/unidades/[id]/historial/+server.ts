import { json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";
import { historialUnidad } from "$lib/server/notas";

/**
 * GET /api/unidades/[id]/historial — service history for a vehicle, warranty threads included.
 * Permission: `nota:read`. Used by `ClienteUnidadPicker` when a unidad is selected, and by the
 * unit's own detail page.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "nota:read");
	return json(await historialUnidad(params.id!));
};
