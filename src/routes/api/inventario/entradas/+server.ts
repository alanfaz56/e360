import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { requirePermission, requireUser } from "$lib/server/guard";
import { registrarEntrada } from "$lib/server/inventario";
import prisma from "$lib/prisma";

/** GET /api/inventario/entradas — goods receipts. Permission: `inventario:read`. */
export const GET: RequestHandler = async ({ locals, url }) => {
	requirePermission(locals, "inventario:read");
	const take = Math.min(Number(url.searchParams.get("perPage") ?? 25) || 25, 100);

	const filas = await prisma.inventario_entrada.findMany({
		orderBy: { recibidaAt: "desc" },
		take,
		include: { registradaPor: { select: { name: true } }, _count: { select: { capas: true } } },
	});

	return json({
		entradas: filas.map((e) => ({
			id: e.id,
			folio: e.folio,
			proveedor: e.proveedor,
			referencia: e.referencia,
			cfdiUuid: e.cfdiUuid,
			cfdiEmisorRfc: e.cfdiEmisorRfc,
			cfdiEmisorNombre: e.cfdiEmisorNombre,
			cfdiTotal: e.cfdiTotal?.toFixed(2) ?? null,
			cfdiFecha: e.cfdiFecha?.toISOString() ?? null,
			// Never the XML itself in a list. It is kept verbatim on the row for whoever needs the
			// stamped document, but shipping it per row would be megabytes nobody asked for.
			tieneXml: e.cfdiXml !== null,
			renglones: e._count.capas,
			registradaPor: e.registradaPor?.name ?? null,
			recibidaAt: e.recibidaAt.toISOString(),
		})),
	});
};

/**
 * POST /api/inventario/entradas — receive goods. Permission: `inventario:entrada`.
 *
 * Body: `{ proveedor?, referencia?, cfdiXml?, notas?, lineas: [{ productoId, cantidad, costoUnitario }] }`
 *
 * Each line opens a FIFO layer at its own cost. The CFDI is optional — plenty of parts arrive with
 * a paper note — but if one is sent its UUID is unique, so the same supplier invoice cannot be
 * received into stock twice.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	try {
		const entrada = await registrarEntrada({ actor, body });
		return json({ entrada: { id: entrada.id, folio: entrada.folio, cfdiUuid: entrada.cfdiUuid } }, { status: 201 });
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
