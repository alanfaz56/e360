/**
 * Gastos generales — shop overhead not tied to any nota_servicio (electricidad, agua, nómina,
 * renta...). Mirrors the comercial.ts / server/comercial.ts split: this is the server half.
 *
 * Counts toward utilidad neta (dashboard/resumen.ts) ONLY once `estado = "confirmado"` — see
 * `totalGastosPeriodo`. A `pendiente` draft, generated from a `gasto_plantilla` by
 * `asegurarDraftsDelPeriodo`, is invisible to that total until a human confirms it.
 */
import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { centavos, pesos } from "$lib/comercial";
import { aCentavos } from "./comercial";
import { enZona, parseFecha, sumarDias } from "$lib/agenda";
import { GASTO_ESTADOS, isGastoEstado, type GastoEstado } from "$lib/gastos";
import { recordAudit } from "./audit";
import { DEFAULT_PAGE_SIZE, pageMeta, parsePageParams, skipFor, type PageParams } from "./paginate";
import type { Actor } from "./guard";

/** Thrown for anything the caller did wrong; routes map `.status` straight to HTTP. */
export class GastoError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

function requirePermiso(actor: Actor, permission: "gasto:read" | "gasto:create" | "gasto:manage") {
	if (!can(actor.role, permission)) throw new GastoError(403, `Sin permiso: ${permission}`);
}

// --- Categorías --------------------------------------------------------------------------------

export async function listarCategorias(actor: Actor, { soloActivas = true } = {}) {
	requirePermiso(actor, "gasto:read");
	return prisma.gasto_categoria.findMany({
		where: soloActivas ? { activa: true } : {},
		orderBy: { nombre: "asc" },
	});
}

export async function crearCategoria(actor: Actor, body: Record<string, unknown>) {
	requirePermiso(actor, "gasto:manage");
	const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
	if (!nombre || nombre.length > 80) throw new GastoError(400, "Nombre de categoría inválido");

	const categoria = await prisma.gasto_categoria.create({ data: { id: randomUUID(), nombre } });
	await recordAudit(prisma, {
		action: "gasto_categoria.create",
		actor,
		entityId: categoria.id,
		entityLabel: categoria.nombre,
	});
	return categoria;
}

// --- Plantillas ----------------------------------------------------------------------------

function readPlantillaInput(body: Record<string, unknown>) {
	const descripcion = typeof body.descripcion === "string" ? body.descripcion.trim() : "";
	if (!descripcion || descripcion.length > 255) throw new GastoError(400, "Descripción inválida");

	const montoDefault = centavos(body.montoDefault);
	if (montoDefault === null || montoDefault === 0n) throw new GastoError(400, "Monto inválido (usa 1234.50)");

	const diaMes = Number(body.diaMes);
	if (!Number.isInteger(diaMes) || diaMes < 1 || diaMes > 28) {
		throw new GastoError(400, "Día del mes inválido (usa 1-28)");
	}

	const categoriaId = typeof body.categoriaId === "string" ? body.categoriaId : "";
	if (!categoriaId) throw new GastoError(400, "Selecciona una categoría");

	return { descripcion, montoDefault, diaMes, categoriaId };
}

export async function listarPlantillas(actor: Actor, { soloActivas = true } = {}) {
	requirePermiso(actor, "gasto:read");
	return prisma.gasto_plantilla.findMany({
		where: soloActivas ? { activa: true } : {},
		include: { categoria: true },
		orderBy: { descripcion: "asc" },
	});
}

export async function crearPlantilla(actor: Actor, body: Record<string, unknown>) {
	requirePermiso(actor, "gasto:manage");
	const input = readPlantillaInput(body);

	const categoria = await prisma.gasto_categoria.findUnique({ where: { id: input.categoriaId } });
	if (!categoria || !categoria.activa) throw new GastoError(400, "Categoría inválida o archivada");

	const plantilla = await prisma.gasto_plantilla.create({
		data: {
			id: randomUUID(),
			categoriaId: input.categoriaId,
			descripcion: input.descripcion,
			montoDefault: pesos(input.montoDefault),
			diaMes: input.diaMes,
			creadaPorId: actor.id,
		},
	});
	await recordAudit(prisma, {
		action: "gasto_plantilla.create",
		actor,
		entityId: plantilla.id,
		entityLabel: plantilla.descripcion,
		after: { descripcion: plantilla.descripcion, montoDefault: pesos(input.montoDefault), diaMes: input.diaMes },
	});
	return plantilla;
}

export async function archivarPlantilla(actor: Actor, id: string) {
	requirePermiso(actor, "gasto:manage");
	const plantilla = await prisma.gasto_plantilla.update({ where: { id }, data: { activa: false } });
	await recordAudit(prisma, {
		action: "gasto_plantilla.archive",
		actor,
		entityId: plantilla.id,
		entityLabel: plantilla.descripcion,
	});
	return plantilla;
}

/**
 * The period key a plantilla drafts against — first-of-month, so "one draft per plantilla per
 * period" (the `@@unique([plantillaId, fecha])` constraint) means one per calendar month.
 */
function primerDiaDelMes(fecha = new Date()): Date {
	return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1));
}

/**
 * For every active plantilla, ensure a `pendiente` gasto draft exists for the current period.
 * Lazy: no cron — called from /panel/gastos's `load`. Idempotent: relies on the unique
 * constraint as the backstop against a duplicate draft from a concurrent load, same reasoning
 * as the re-check inside `registrarPago`'s transaction (docs/billing.md).
 */
export async function asegurarDraftsDelPeriodo(actor: Actor, ahora = new Date()) {
	requirePermiso(actor, "gasto:read");
	const periodo = primerDiaDelMes(ahora);

	const plantillas = await prisma.gasto_plantilla.findMany({ where: { activa: true } });
	for (const plantilla of plantillas) {
		try {
			await prisma.gasto.create({
				data: {
					id: randomUUID(),
					categoriaId: plantilla.categoriaId,
					plantillaId: plantilla.id,
					descripcion: plantilla.descripcion,
					monto: plantilla.montoDefault,
					fecha: periodo,
					estado: "pendiente",
				},
			});
		} catch (err) {
			// Unique violation on (plantillaId, fecha) = another load already drafted this period.
			if (!(err instanceof Error) || !("code" in err) || (err as { code?: string }).code !== "P2002") throw err;
		}
	}
}

// --- Gastos --------------------------------------------------------------------------------

export type GastoQuery = {
	categoriaId?: string | null;
	estado?: string | null;
	desde?: string | null;
	hasta?: string | null;
	page?: number;
	perPage?: number;
};

export function parseGastoQuery(params: URLSearchParams): GastoQuery {
	return {
		categoriaId: params.get("categoriaId"),
		estado: params.get("estado"),
		desde: params.get("desde"),
		hasta: params.get("hasta"),
		...parsePageParams(params, DEFAULT_PAGE_SIZE),
	};
}

export async function listarGastos(actor: Actor, query: GastoQuery) {
	requirePermiso(actor, "gasto:read");
	const paging: PageParams = { page: query.page ?? 1, perPage: query.perPage ?? DEFAULT_PAGE_SIZE };

	const where: Prisma.gastoWhereInput = {
		archivedAt: null,
		...(query.categoriaId ? { categoriaId: query.categoriaId } : {}),
		...(query.estado && isGastoEstado(query.estado) ? { estado: query.estado } : {}),
		...rangoFecha(query.desde, query.hasta),
	};

	const [total, rows] = await Promise.all([
		prisma.gasto.count({ where }),
		prisma.gasto.findMany({
			where,
			include: { categoria: true },
			orderBy: { fecha: "desc" },
			skip: skipFor(paging),
			take: paging.perPage,
		}),
	]);

	return {
		gastos: rows.map((g) => ({ ...g, monto: pesos(aCentavos(g.monto)) })),
		...pageMeta(total, paging),
	};
}

/**
 * A `fecha` range from two shop-local calendar days, both inclusive — same shape as
 * comercial.ts's `rangoCreado`, but over `fecha` (when the expense applies), not `createdAt`
 * (when the row was typed in).
 */
function rangoFecha(desde: string | null | undefined, hasta: string | null | undefined) {
	const d = parseFecha(desde);
	const h = parseFecha(hasta);
	if (!d && !h) return {};
	return {
		fecha: {
			...(d ? { gte: enZona(d) } : {}),
			...(h ? { lt: enZona(sumarDias(h, 1)) } : {}),
		},
	};
}

function readGastoInput(body: Record<string, unknown>) {
	const descripcion = typeof body.descripcion === "string" ? body.descripcion.trim() : "";
	if (!descripcion || descripcion.length > 255) throw new GastoError(400, "Descripción inválida");

	const monto = centavos(body.monto);
	if (monto === null || monto === 0n) throw new GastoError(400, "Monto inválido (usa 1234.50)");

	const fecha = typeof body.fecha === "string" ? new Date(body.fecha) : null;
	if (!fecha || Number.isNaN(fecha.getTime())) throw new GastoError(400, "Fecha inválida");

	const categoriaId = typeof body.categoriaId === "string" ? body.categoriaId : "";
	if (!categoriaId) throw new GastoError(400, "Selecciona una categoría");

	return { descripcion, monto, fecha, categoriaId };
}

export async function crearGasto(actor: Actor, body: Record<string, unknown>) {
	requirePermiso(actor, "gasto:create");
	const input = readGastoInput(body);

	const categoria = await prisma.gasto_categoria.findUnique({ where: { id: input.categoriaId } });
	if (!categoria || !categoria.activa) throw new GastoError(400, "Categoría inválida o archivada");

	const gasto = await prisma.gasto.create({
		data: {
			id: randomUUID(),
			categoriaId: input.categoriaId,
			descripcion: input.descripcion,
			monto: pesos(input.monto),
			fecha: input.fecha,
			estado: "confirmado",
			creadaPorId: actor.id,
		},
	});
	await recordAudit(prisma, {
		action: "gasto.create",
		actor,
		entityId: gasto.id,
		entityLabel: gasto.descripcion,
		after: { descripcion: gasto.descripcion, monto: pesos(input.monto), categoriaId: input.categoriaId },
	});
	return gasto;
}

/** Confirms a `pendiente` draft, optionally overriding its monto before it counts toward utilidad. */
export async function confirmarGastoPendiente(actor: Actor, id: string, montoFinal?: unknown) {
	requirePermiso(actor, "gasto:create");

	const gasto = await prisma.gasto.findUnique({ where: { id } });
	if (!gasto) throw new GastoError(404, "Gasto no encontrado");
	if (gasto.estado !== "pendiente") throw new GastoError(409, "Ese gasto ya está confirmado");

	let montoStr: string | undefined;
	if (montoFinal !== undefined) {
		const cents = centavos(montoFinal);
		if (cents === null || cents === 0n) throw new GastoError(400, "Monto inválido (usa 1234.50)");
		montoStr = pesos(cents);
	}

	const actualizado = await prisma.gasto.update({
		where: { id },
		data: {
			...(montoStr !== undefined ? { monto: montoStr } : {}),
			estado: "confirmado",
			confirmadaPorId: actor.id,
			confirmadaAt: new Date(),
		},
	});
	await recordAudit(prisma, {
		action: "gasto.confirmar",
		actor,
		entityId: actualizado.id,
		entityLabel: actualizado.descripcion,
		after: { monto: pesos(aCentavos(actualizado.monto)) },
	});
	return actualizado;
}

export async function archivarGasto(actor: Actor, id: string) {
	requirePermiso(actor, "gasto:create");
	const gasto = await prisma.gasto.update({ where: { id }, data: { archivedAt: new Date() } });
	await recordAudit(prisma, {
		action: "gasto.archive",
		actor,
		entityId: gasto.id,
		entityLabel: gasto.descripcion,
	});
	return gasto;
}

/**
 * Gastos confirmados del período, en centavos. La ÚNICA función que dashboard/resumen.ts llama
 * para restar de utilidad — "cuenta una vez, en un solo lugar" (docs/billing.md). Un `pendiente`
 * no cuenta: todavía no es un gasto real, es un borrador esperando confirmación.
 */
export async function totalGastosPeriodo(desde: string, hasta: string): Promise<bigint> {
	const suma = await prisma.gasto.aggregate({
		_sum: { monto: true },
		where: { estado: "confirmado", archivedAt: null, ...rangoFecha(desde, hasta) },
	});
	return aCentavos(suma._sum.monto);
}

export { GASTO_ESTADOS };
export type { GastoEstado };
