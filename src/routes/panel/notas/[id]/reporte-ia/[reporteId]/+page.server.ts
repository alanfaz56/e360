import type { ServerLoad } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { getReporteIA } from "$lib/server/notas";

/**
 * Its own page, deliberately: a saved AI report needs a stable, shareable, print-only URL — no
 * sibling nota content on it to accidentally print alongside it. Authorization mirrors
 * `generarReporteIA` exactly (same permission, same taller-scoping fallback).
 */
export const load: ServerLoad = async ({ locals, params }) => {
	const actor = requireUser(locals);
	const reporte = await getReporteIA(actor, params.id!, params.reporteId!);
	return { reporte };
};
