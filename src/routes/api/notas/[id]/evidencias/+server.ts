import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requirePermission, requireUser } from "$lib/server/guard";
import { NotaError, getNotaDetalle, registrarEvidencia } from "$lib/server/notas";

/** GET /api/notas/[id]/evidencias — with readable URLs. Permission: `nota:read`. */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "nota:read");
	try {
		const { evidencias } = await getNotaDetalle(params.id!);
		return json({ evidencias });
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};

/**
 * POST /api/notas/[id]/evidencias — record a file that already landed in R2.
 * Body: { clave, categoria, contentType, nombre?, bytes?, descripcion? }.
 * Permission: `nota:inspect`.
 *
 * The `clave` must be one we signed for THIS note — checked by prefix — so a client cannot
 * register an object belonging to another job.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const evidencia = await registrarEvidencia({ actor, id: params.id!, body });
		return json(
			{
				evidencia: {
					id: evidencia.id,
					tipo: evidencia.tipo,
					categoria: evidencia.categoria,
					nombre: evidencia.nombre,
					createdAt: evidencia.createdAt.toISOString(),
				},
			},
			{ status: 201 },
		);
	} catch (err) {
		if (err instanceof NotaError) error(err.status, err.message);
		throw err;
	}
};
