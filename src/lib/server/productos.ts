import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { isConceptoTipo } from "$lib/comercial";
import { cantidad } from "$lib/inventario";
import {
	CLAVE_PROD_SERV_DEFAULT,
	CLAVE_UNIDAD_DEFAULT,
	claveProdServLabel,
	claveUnidadLabel,
	esClaveProdServ,
	esClaveUnidad,
} from "$lib/sat-catalogos";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import { pageMeta, parsePageParams, skipFor, type PageParams } from "./paginate";
import type { Actor } from "./guard";

/**
 * The catalogue of what the shop sells: parts, labour, consumables, sublet work.
 *
 * SAT keys are carried from day one even though nothing is stamped yet. Adding them later means
 * going back over every line ever quoted to guess which `ClaveProdServ` it should have had, and
 * nobody remembers. They cost nothing now and cannot be backfilled honestly.
 */

export { ClienteError as ProductoError };

const precio = (v: unknown, label: string): number => {
	const s = typeof v === "number" ? String(v) : trim(v);
	if (s === null) return 0;
	if (!/^\d+(\.\d{1,2})?$/.test(s.replace(/,/g, ""))) {
		throw new ClienteError(400, `${label} no es una cantidad válida (usa 1234.50)`);
	}
	return Number(s.replace(/,/g, ""));
};

/** Nullable, unlike `precio()`: a blank field CLEARS the cost basis rather than zeroing it. */
const costoOpcional = (v: unknown): number | null => {
	const s = typeof v === "number" ? String(v) : trim(v);
	if (s === null) return null;
	if (!/^\d+(\.\d{1,4})?$/.test(s.replace(/,/g, ""))) {
		throw new ClienteError(400, "El costo de referencia no es una cantidad válida (usa 1234.5000)");
	}
	return Number(s.replace(/,/g, ""));
};

export const publicProducto = (p: {
	id: string;
	sku: string | null;
	nombre: string;
	descripcion: string | null;
	tipo: string;
	claveProdServ: string;
	claveUnidad: string;
	unidad: string;
	precioVenta: Prisma.Decimal;
	ivaTasa: Prisma.Decimal;
	controlaInventario: boolean;
	existencia: Prisma.Decimal;
	minimo: Prisma.Decimal | null;
	archivedAt: Date | null;
	createdAt: Date;
}) => ({
	id: p.id,
	sku: p.sku,
	nombre: p.nombre,
	descripcion: p.descripcion,
	tipo: p.tipo,
	claveProdServ: p.claveProdServ,
	claveProdServLabel: claveProdServLabel(p.claveProdServ),
	claveUnidad: p.claveUnidad,
	claveUnidadLabel: claveUnidadLabel(p.claveUnidad),
	unidad: p.unidad,
	// `.toFixed(2)`, never `.toString()`: Decimal drops trailing zeros, so 1500.00 would serialize
	// as "1500" and an integrator would silently disagree about the price.
	precioVenta: p.precioVenta.toFixed(2),
	ivaTasa: p.ivaTasa.toFixed(4),
	controlaInventario: p.controlaInventario,
	existencia: p.existencia.toFixed(3),
	minimo: p.minimo?.toFixed(3) ?? null,
	archivado: p.archivedAt !== null,
	createdAt: p.createdAt.toISOString(),
});

/**
 * `publicProducto` plus the cost basis — gated by `producto:costo`, never by `producto:read`.
 * Callers must check the permission themselves before reaching for this mapper; `publicProducto`
 * itself never carries the field, so "does this response include cost" is answered by which
 * function was called, not by a flag that could be forgotten.
 */
export const productoConCosto = (p: Parameters<typeof publicProducto>[0] & { costoReferencia: Prisma.Decimal | null }) => ({
	...publicProducto(p),
	costoReferencia: p.costoReferencia?.toFixed(4) ?? null,
});

/**
 * What a MECHANIC is allowed to see of the catalogue.
 *
 * No `precioVenta`, no cost, no margin. They need to name a part and know whether there is one on
 * the shelf; what the shop charges for it is not their decision and not their business. This is
 * why `producto:read` is not one of the `taller` role's permissions — the narrow view is a
 * different mapper, not a filtered version of the full one.
 */
export const productoParaTaller = (p: {
	id: string;
	sku: string | null;
	nombre: string;
	unidad: string;
	existencia: Prisma.Decimal;
}) => ({
	id: p.id,
	sku: p.sku,
	nombre: p.nombre,
	unidad: p.unidad,
	existencia: p.existencia.toFixed(3),
	hay: Number(p.existencia) > 0,
});

export type ProductoQuery = {
	q?: string | null;
	tipo?: string | null;
	archivados?: boolean;
	/** Only things that run out and are at or below their reorder point. */
	bajos?: boolean;
} & Partial<PageParams>;

export function parseProductoQuery(params: URLSearchParams): ProductoQuery {
	return {
		q: params.get("q"),
		tipo: params.get("tipo"),
		archivados: params.get("archivados") === "1",
		bajos: params.get("bajos") === "1",
		...parsePageParams(params),
	};
}

function whereProducto(query: ProductoQuery): Prisma.productoWhereInput {
	return {
		...(query.archivados ? {} : { archivedAt: null }),
		...(isConceptoTipo(query.tipo) ? { tipo: query.tipo } : {}),
		...(query.bajos
			? {
					controlaInventario: true,
					// Postgres cannot compare two columns through Prisma's filter syntax, so "at or
					// below minimum" is done as a raw fragment below; here we only narrow to things
					// that HAVE a minimum or are already at zero.
					OR: [{ existencia: { lte: 0 } }, { minimo: { not: null } }],
				}
			: {}),
		...(query.q
			? {
					OR: [
						{ nombre: { contains: query.q, mode: "insensitive" } },
						{ descripcion: { contains: query.q, mode: "insensitive" } },
						{ sku: { contains: query.q, mode: "insensitive" } },
					],
				}
			: {}),
	};
}

export async function listProductos(query: ProductoQuery) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 25 };
	const where = whereProducto(query);

	const [total, rows] = await Promise.all([
		prisma.producto.count({ where }),
		prisma.producto.findMany({
			where,
			orderBy: { nombre: "asc" },
			skip: skipFor(paging),
			take: paging.perPage,
		}),
	]);

	let productos = rows.map(publicProducto);
	// The real "below minimum" test compares two columns, which Prisma cannot express. Applying it
	// after the page is fetched would silently drop rows from the count, so `bajos` is filtered
	// here AND the page size is generous — this list is a shopping list, not a browse.
	if (query.bajos) {
		productos = productos.filter(
			(p) => Number(p.existencia) <= 0 || (p.minimo !== null && Number(p.existencia) <= Number(p.minimo)),
		);
	}

	return { productos, ...pageMeta(total, paging) };
}

/** Name-and-stock only, for the mechanic's part request. Never exposes a price. */
export async function buscarParaTaller(q: string | null) {
	const rows = await prisma.producto.findMany({
		where: {
			archivedAt: null,
			controlaInventario: true,
			...(q
				? {
						OR: [
							{ nombre: { contains: q, mode: "insensitive" } },
							{ sku: { contains: q, mode: "insensitive" } },
						],
					}
				: {}),
		},
		orderBy: [{ existencia: "desc" }, { nombre: "asc" }],
		take: 20,
		select: { id: true, sku: true, nombre: true, unidad: true, existencia: true },
	});
	return rows.map(productoParaTaller);
}

export async function getProducto(id: string) {
	const producto = await prisma.producto.findUnique({ where: { id } });
	if (!producto) throw new ClienteError(404, "Producto no encontrado");
	return producto;
}

function leerProductoInput(body: Record<string, unknown>, actor: Actor) {
	const nombre = trim(body.nombre, 200, "El nombre");
	if (!nombre) throw new ClienteError(400, "El nombre del producto es obligatorio");

	const tipo = trim(body.tipo) ?? "refaccion";
	if (!isConceptoTipo(tipo)) throw new ClienteError(400, "Tipo inválido");

	const claveProdServ = trim(body.claveProdServ) ?? CLAVE_PROD_SERV_DEFAULT[tipo];
	if (!esClaveProdServ(claveProdServ)) {
		throw new ClienteError(400, "La clave del SAT (ClaveProdServ) debe ser de 8 dígitos");
	}

	const claveUnidad = (trim(body.claveUnidad) ?? CLAVE_UNIDAD_DEFAULT).toUpperCase();
	if (!esClaveUnidad(claveUnidad)) throw new ClienteError(400, "La clave de unidad del SAT no es válida");

	const ivaTasa = body.ivaTasa === undefined || body.ivaTasa === "" ? 0.16 : Number(body.ivaTasa);
	if (!Number.isFinite(ivaTasa) || ivaTasa < 0 || ivaTasa > 1) {
		throw new ClienteError(400, "La tasa de IVA va entre 0 y 1 (0.16 para el 16%)");
	}

	// Labour cannot run out, so it never carries stock — the same rule as
	// `producto_inventario_fisico_check` in the database.
	const fisico = tipo === "refaccion" || tipo === "insumo";
	const controlaInventario = fisico && body.controlaInventario !== false && body.controlaInventario !== "0";

	const minimoRaw = trim(body.minimo);
	const minimo = minimoRaw === null ? null : cantidad(minimoRaw);
	if (minimoRaw !== null && minimo === null) throw new ClienteError(400, "El mínimo no es una cantidad válida");

	// Gated on the actor, not on what the body sent: a Gerente posting a costoReferencia (by hand
	// or by replaying an Admin's request) must have it silently ignored, not error the whole save.
	const puedeCosto = can(actor.role, "producto:costo");

	return {
		nombre,
		sku: trim(body.sku, 40, "El SKU"),
		descripcion: trim(body.descripcion, 500, "La descripción"),
		tipo,
		claveProdServ,
		claveUnidad,
		unidad: trim(body.unidad, 20, "La unidad") ?? claveUnidadLabel(claveUnidad).slice(0, 20),
		precioVenta: precio(body.precioVenta, "El precio de venta"),
		ivaTasa,
		controlaInventario,
		minimo: controlaInventario ? minimo : null,
		...(puedeCosto ? { costoReferencia: costoOpcional(body.costoReferencia) } : {}),
	};
}

export async function crearProducto(input: { actor: Actor; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "producto:manage")) throw new ClienteError(403, "Sin permiso: producto:manage");

	const data = leerProductoInput(input.body, input.actor);
	if (data.sku) {
		const repetido = await prisma.producto.findUnique({ where: { sku: data.sku }, select: { id: true } });
		if (repetido) throw new ClienteError(409, `Ya hay un producto con el SKU ${data.sku}.`);
	}

	const producto = await prisma.producto.create({ data: { id: randomUUID(), ...data } });

	await recordAudit(prisma, {
		action: "producto.create",
		actor: input.actor,
		entityId: producto.id,
		entityLabel: producto.nombre,
		summary: `Producto dado de alta: ${producto.nombre}`,
		after: {
			tipo: producto.tipo,
			precioVenta: producto.precioVenta.toFixed(2),
			claveProdServ: producto.claveProdServ,
		},
	});

	return producto;
}

export async function actualizarProducto(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "producto:manage")) throw new ClienteError(403, "Sin permiso: producto:manage");

	const actual = await getProducto(input.id);
	const data = leerProductoInput(
		{
			nombre: actual.nombre,
			sku: actual.sku,
			descripcion: actual.descripcion,
			tipo: actual.tipo,
			claveProdServ: actual.claveProdServ,
			claveUnidad: actual.claveUnidad,
			unidad: actual.unidad,
			precioVenta: actual.precioVenta.toFixed(2),
			ivaTasa: Number(actual.ivaTasa),
			controlaInventario: actual.controlaInventario,
			minimo: actual.minimo?.toFixed(3) ?? null,
			costoReferencia: actual.costoReferencia?.toFixed(4) ?? null,
			...input.body,
		},
		input.actor,
	);

	if (data.sku && data.sku !== actual.sku) {
		const repetido = await prisma.producto.findUnique({ where: { sku: data.sku }, select: { id: true } });
		if (repetido) throw new ClienteError(409, `Ya hay un producto con el SKU ${data.sku}.`);
	}

	// Turning stock control OFF on something that still has units would strand them: the layers
	// stay, the movements stay, and the number nobody looks at any more silently goes stale.
	if (actual.controlaInventario && !data.controlaInventario && Number(actual.existencia) !== 0) {
		throw new ClienteError(
			409,
			`No puedes quitarle el control de inventario: todavía hay ${actual.existencia.toFixed(3)} en existencia.`,
		);
	}

	const producto = await prisma.producto.update({ where: { id: actual.id }, data });

	await recordAudit(prisma, {
		action: "producto.update",
		actor: input.actor,
		entityId: producto.id,
		entityLabel: producto.nombre,
		summary: `Producto actualizado: ${producto.nombre}`,
		before: {
			nombre: actual.nombre,
			precioVenta: actual.precioVenta.toFixed(2),
			claveProdServ: actual.claveProdServ,
			...("costoReferencia" in data ? { costoReferencia: actual.costoReferencia?.toFixed(4) ?? null } : {}),
		},
		after: {
			nombre: producto.nombre,
			precioVenta: producto.precioVenta.toFixed(2),
			claveProdServ: producto.claveProdServ,
			...("costoReferencia" in data ? { costoReferencia: producto.costoReferencia?.toFixed(4) ?? null } : {}),
		},
	});

	return producto;
}

/** Archive, never delete: a product that has been quoted or issued is part of the history. */
export async function archivarProducto(input: { actor: Actor; id: string; archivado: boolean }) {
	if (!can(input.actor.role, "producto:manage")) throw new ClienteError(403, "Sin permiso: producto:manage");

	const actual = await getProducto(input.id);
	if ((actual.archivedAt !== null) === input.archivado) {
		throw new ClienteError(409, input.archivado ? "Ya está archivado." : "No está archivado.");
	}
	if (input.archivado && Number(actual.existencia) > 0) {
		throw new ClienteError(
			409,
			`No puedes archivarlo con ${actual.existencia.toFixed(3)} en existencia. Ajusta o consume primero.`,
		);
	}

	const producto = await prisma.producto.update({
		where: { id: actual.id },
		data: { archivedAt: input.archivado ? new Date() : null },
	});

	await recordAudit(prisma, {
		action: "producto.archive",
		actor: input.actor,
		entityId: producto.id,
		entityLabel: producto.nombre,
		summary: `${producto.nombre} ${input.archivado ? "archivado" : "reactivado"}`,
		before: { archivado: actual.archivedAt !== null },
		after: { archivado: input.archivado },
	});

	return producto;
}
