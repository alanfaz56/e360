import { error, json, type RequestHandler } from "@sveltejs/kit";
import { requireUser } from "$lib/server/guard";
import { CAMPOS_FUSIONABLES, ClienteError, publicCliente, mergeClientes, type CampoFusionable } from "$lib/server/clientes";

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * POST /api/clientes/:id/merge — fold a duplicate customer into `:id`.
 * Body: { duplicadoId, motivo, contactosAConservar?: string[], telefonosAConservar?: string[],
 *         crearContactoDelDuplicado?: boolean, camposElegidos?: Record<campo, "keeper"|"duplicado"> }
 *
 * Permission: `cliente:merge` (Admin only). `:id` is always the keeper — everything the
 * duplicate owned (unidades, citas, notas, facturas, contactos elegidos) moves to it, and the
 * duplicate is archived, never deleted. See `mergeClientes`.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	if (typeof body.duplicadoId !== "string" || !body.duplicadoId) {
		error(400, "Se requiere `duplicadoId`");
	}

	try {
		const duplicado = await mergeClientes({
			actor,
			keeperId: params.id!,
			duplicadoId: body.duplicadoId,
			motivo: body.motivo,
			contactosAConservar: asStrings(body.contactosAConservar),
			telefonosAConservar: asStrings(body.telefonosAConservar),
			crearContactoDelDuplicado: body.crearContactoDelDuplicado === true,
			camposElegidos:
				body.camposElegidos && typeof body.camposElegidos === "object"
					? (Object.fromEntries(
							CAMPOS_FUSIONABLES.filter((c) => body.camposElegidos[c] === "duplicado").map((c) => [c, "duplicado"]),
						) as Partial<Record<CampoFusionable, "duplicado">>)
					: undefined,
		});
		return json({ duplicado: publicCliente(duplicado) });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
