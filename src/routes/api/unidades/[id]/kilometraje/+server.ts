import { error, json, type RequestHandler } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import { requirePermission, requireUser } from "$lib/server/guard";
import { ClienteError } from "$lib/server/clientes";
import { historialKilometraje, registrarKilometraje } from "$lib/server/notas";
import { getUnidad } from "$lib/server/unidades";

/**
 * GET /api/unidades/[id]/kilometraje — odometer history with usage between readings.
 * Permission: `unidad:read`.
 *
 * `resumen.visitas` counts only the readings taken at intake, which is the "how often does this
 * unit come in" question; `kmPorDia` between consecutive readings is what a fleet actually asks.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	requirePermission(locals, "unidad:read");
	try {
		const unidad = await getUnidad(params.id!);
		return json(await historialKilometraje(unidad.id));
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};

/**
 * POST /api/unidades/[id]/kilometraje — record a reading by hand. Permission: `unidad:update`.
 * Body: { kilometraje, notas?, forzar?: "1" }
 *
 * A reading BELOW the last one is refused unless `forzar` says it is a correction — odometers do
 * not run backwards, and a typo here silently poisons every usage figure that follows.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requirePermission(locals, "unidad:update");
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const unidad = await getUnidad(params.id!);
		const lectura = await prisma.$transaction((tx) =>
			registrarKilometraje(tx, {
				actor,
				unidadId: unidad.id,
				kilometraje: Number(body.kilometraje),
				origen: "manual",
				forzar: body.forzar === "1" || body.forzar === true,
				notas: body.notas,
			}),
		);
		return json(
			{ lectura: { id: lectura.id, kilometraje: lectura.kilometraje, correccion: lectura.correccion } },
			{ status: 201 },
		);
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
