import { randomUUID } from "node:crypto";
// `Prisma` is used as a VALUE here (Prisma.Decimal), not only as a type namespace.
import { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { cantidad, formatoCantidad, isMovimientoTipo, movimientoTipoLabel } from "$lib/inventario";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import { notificar } from "./notificaciones";
import { pageMeta, parsePageParams, skipFor, type PageParams } from "./paginate";
import { getProducto } from "./productos";
import { leerCfdi } from "$lib/cfdi";
import type { Actor } from "./guard";
import { alcanceDeTaller } from "./notas";
import { resolverProveedorPorCfdi } from "./proveedores";

/**
 * FIFO inventory.
 *
 * Every receipt opens a LAYER: a quantity at a cost. Every issue consumes the oldest layers first
 * and writes one movement per layer it touched, each carrying the cost that layer actually
 * charged. That is the whole reason this is not a single `existencia` number with an average cost
 * beside it — ten filters at $80 and ten at $95 are not twenty at $87.50, and any margin computed
 * that way is fiction the moment prices move.
 *
 * `producto.existencia` is denormalized from the open layers and written in the SAME transaction,
 * exactly like `unidad.kilometraje`. It exists so a product list needs no subquery; the layers and
 * the ledger are the truth.
 */

export { ClienteError as InventarioError };
// Re-exported so callers have one import for "inventory"; the parser itself is pure and lives
// in $lib/cfdi so it can be tested without a database.
export { leerCfdi };

const dec = (n: number) => new Prisma.Decimal(n.toFixed(3));
const decCosto = (n: number) => new Prisma.Decimal(n.toFixed(4));
const decDinero = (n: number) => new Prisma.Decimal(n.toFixed(2));

// ================================================================================================
// Lectura
// ================================================================================================

export const publicMovimiento = (m: {
	id: string;
	productoId: string;
	tipo: string;
	cantidad: Prisma.Decimal;
	costoUnitario: Prisma.Decimal;
	costoTotal: Prisma.Decimal;
	motivo: string | null;
	notaId: string | null;
	createdAt: Date;
	producto?: { nombre: string; unidad: string } | null;
	nota?: { folio: number } | null;
	registradoPor?: { name: string } | null;
}) => ({
	id: m.id,
	productoId: m.productoId,
	productoNombre: m.producto?.nombre ?? null,
	unidad: m.producto?.unidad ?? null,
	tipo: m.tipo,
	tipoLabel: movimientoTipoLabel(m.tipo),
	cantidad: m.cantidad.toFixed(3),
	costoUnitario: m.costoUnitario.toFixed(4),
	costoTotal: m.costoTotal.toFixed(2),
	motivo: m.motivo,
	notaId: m.notaId,
	notaFolio: m.nota?.folio ?? null,
	registradoPor: m.registradoPor?.name ?? null,
	createdAt: m.createdAt.toISOString(),
});

export type MovimientoQuery = {
	productoId?: string | null;
	notaId?: string | null;
	tipo?: string | null;
} & Partial<PageParams>;

export function parseMovimientoQuery(params: URLSearchParams): MovimientoQuery {
	return {
		productoId: params.get("productoId"),
		notaId: params.get("notaId"),
		tipo: params.get("tipo"),
		...parsePageParams(params),
	};
}

export async function listMovimientos(query: MovimientoQuery) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 50 };
	const where: Prisma.inventario_movimientoWhereInput = {
		...(query.productoId ? { productoId: query.productoId } : {}),
		...(query.notaId ? { notaId: query.notaId } : {}),
		...(isMovimientoTipo(query.tipo) ? { tipo: query.tipo } : {}),
	};

	const [total, rows] = await Promise.all([
		prisma.inventario_movimiento.count({ where }),
		prisma.inventario_movimiento.findMany({
			where,
			orderBy: { createdAt: "desc" },
			skip: skipFor(paging),
			take: paging.perPage,
			include: {
				producto: { select: { nombre: true, unidad: true } },
				nota: { select: { folio: true } },
				registradoPor: { select: { name: true } },
			},
		}),
	]);

	return { movimientos: rows.map(publicMovimiento), ...pageMeta(total, paging) };
}

/** The open layers for one product, oldest first — literally the order they will be consumed. */
export async function capasDe(productoId: string) {
	const capas = await prisma.inventario_capa.findMany({
		where: { productoId, restante: { gt: 0 } },
		orderBy: [{ recibidaAt: "asc" }, { createdAt: "asc" }],
		include: { entrada: { select: { folio: true, proveedor: true, cfdiUuid: true } } },
	});

	return capas.map((c) => ({
		id: c.id,
		cantidad: c.cantidad.toFixed(3),
		restante: c.restante.toFixed(3),
		costoUnitario: c.costoUnitario.toFixed(4),
		recibidaAt: c.recibidaAt.toISOString(),
		entradaFolio: c.entrada?.folio ?? null,
		proveedor: c.entrada?.proveedor ?? null,
		conCfdi: Boolean(c.entrada?.cfdiUuid),
	}));
}

/** What the next issue would cost, at today's layers. The honest answer to "how much is my stock". */
export async function valorInventario() {
	const filas = await prisma.inventario_capa.findMany({
		where: { restante: { gt: 0 } },
		select: { restante: true, costoUnitario: true },
	});
	const total = filas.reduce((s, c) => s + Number(c.restante) * Number(c.costoUnitario), 0);
	return { capas: filas.length, valor: total.toFixed(2) };
}

// ================================================================================================
// CFDI del proveedor
// ================================================================================================

// ================================================================================================
// Entrada
// ================================================================================================

type LineaEntrada = { productoId: string; cantidad: number; costoUnitario: number };

function leerLineas(value: unknown): LineaEntrada[] {
	const crudas = Array.isArray(value) ? value : [];
	const lineas: LineaEntrada[] = [];

	for (const l of crudas) {
		if (typeof l !== "object" || l === null) continue;
		const fila = l as Record<string, unknown>;
		const productoId = trim(fila.productoId);
		const cant = cantidad(fila.cantidad);
		const costo = cantidad(fila.costoUnitario);
		if (!productoId || cant === null || cant <= 0 || costo === null) continue;
		lineas.push({ productoId, cantidad: cant, costoUnitario: costo });
	}

	if (lineas.length === 0)
		throw new ClienteError(400, "La entrada necesita al menos un renglón con cantidad y costo");
	return lineas;
}

/**
 * Open ONE FIFO layer and move `producto.existencia` to match, inside the caller's transaction.
 * The shared body behind every way stock enters the shop: a supplier delivery (`registrarEntrada`,
 * one call per line), a product's opening stock (`crearProducto`), and the CFDI wizard's "create
 * new product from this line" path all funnel through here so there is exactly one place that
 * knows how a layer gets opened.
 */
export async function abrirCapa(
	tx: Prisma.TransactionClient,
	input: {
		productoId: string;
		cantidad: number;
		costoUnitario: number;
		entradaId?: string | null;
		motivo?: string | null;
		actor: Actor;
	},
) {
	const capa = await tx.inventario_capa.create({
		data: {
			id: randomUUID(),
			productoId: input.productoId,
			entradaId: input.entradaId ?? null,
			cantidad: dec(input.cantidad),
			restante: dec(input.cantidad),
			costoUnitario: decCosto(input.costoUnitario),
		},
	});

	await tx.inventario_movimiento.create({
		data: {
			id: randomUUID(),
			productoId: input.productoId,
			tipo: "entrada",
			cantidad: dec(input.cantidad),
			costoUnitario: decCosto(input.costoUnitario),
			costoTotal: decDinero(input.cantidad * input.costoUnitario),
			capaId: capa.id,
			entradaId: input.entradaId ?? null,
			motivo: input.motivo ?? null,
			registradoPorId: input.actor.id,
		},
	});

	await tx.producto.update({
		where: { id: input.productoId },
		data: { existencia: { increment: dec(input.cantidad) } },
	});
}

/**
 * Refuse a CFDI (by UUID) that was already received — the mistake that quietly doubles inventory
 * and halves apparent cost. Shared by `registrarEntrada` and `registrarCompra`: same rule either
 * way a purchase enters the shop.
 */
async function exigirCfdiNoDuplicado(uuid: string | null | undefined): Promise<void> {
	if (!uuid) return;
	const repetido = await prisma.inventario_entrada.findUnique({ where: { cfdiUuid: uuid }, select: { folio: true } });
	if (repetido)
		throw new ClienteError(409, `Ese CFDI ya se recibió en la entrada #${repetido.folio}. No se duplica.`);
}

/** Every product a purchase names must exist, not be archived, and actually carry stock. */
async function exigirProductosParaEntrada(productoIds: string[]): Promise<void> {
	const ids = [...new Set(productoIds)];
	if (ids.length === 0) return;
	const productos = await prisma.producto.findMany({
		where: { id: { in: ids } },
		select: { id: true, nombre: true, controlaInventario: true, archivedAt: true },
	});
	const porId = new Map(productos.map((p) => [p.id, p]));
	for (const id of ids) {
		const p = porId.get(id);
		if (!p) throw new ClienteError(404, "Uno de los productos no existe");
		if (p.archivedAt) throw new ClienteError(409, `${p.nombre} está archivado.`);
		if (!p.controlaInventario) throw new ClienteError(400, `${p.nombre} no maneja inventario.`);
	}
}

/** Open one FIFO layer per line of a purchase, all against the same `inventario_entrada`. */
async function abrirCapas(
	tx: Prisma.TransactionClient,
	input: {
		lineas: { productoId: string; cantidad: number; costoUnitario: number }[];
		entradaId: string;
		actor: Actor;
	},
): Promise<void> {
	for (const l of input.lineas) {
		await abrirCapa(tx, {
			productoId: l.productoId,
			cantidad: l.cantidad,
			costoUnitario: l.costoUnitario,
			entradaId: input.entradaId,
			actor: input.actor,
		});
	}
}

/**
 * Receive goods. Opens one FIFO layer per line and moves `producto.existencia` in the same
 * transaction.
 *
 * The CFDI is optional and its UUID is unique, so the same supplier invoice cannot be received
 * into stock twice — the mistake that quietly doubles inventory and halves apparent cost.
 */
export async function registrarEntrada(input: { actor: Actor; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "inventario:entrada")) throw new ClienteError(403, "Sin permiso: inventario:entrada");

	const lineas = leerLineas(input.body.lineas);

	const xml = typeof input.body.cfdiXml === "string" && input.body.cfdiXml.trim() !== "" ? input.body.cfdiXml : null;
	const cfdi = xml ? leerCfdi(xml) : null;
	if (xml && !cfdi) throw new ClienteError(400, "Ese archivo no parece un CFDI. Puedes registrar la entrada sin él.");

	await exigirCfdiNoDuplicado(cfdi?.uuid);
	await exigirProductosParaEntrada(lineas.map((l) => l.productoId));

	const entrada = await prisma.$transaction(async (tx) => {
		const creada = await tx.inventario_entrada.create({
			data: {
				id: randomUUID(),
				proveedor: trim(input.body.proveedor, 200, "El proveedor"),
				referencia: trim(input.body.referencia, 120, "La referencia"),
				cfdiUuid: cfdi?.uuid ?? null,
				cfdiEmisorRfc: cfdi?.emisorRfc ?? null,
				cfdiEmisorNombre: cfdi?.emisorNombre ?? null,
				cfdiTotal: cfdi?.total !== null && cfdi?.total !== undefined ? decDinero(cfdi.total) : null,
				cfdiFecha: cfdi?.fecha ?? null,
				// Stored verbatim, always.
				cfdiXml: xml,
				notas: trim(input.body.notas),
				registradaPorId: input.actor.id,
			},
		});

		await abrirCapas(tx, { lineas, entradaId: creada.id, actor: input.actor });

		await recordAudit(tx, {
			action: "inventario.entrada",
			actor: input.actor,
			entityId: creada.id,
			entityLabel: `Entrada #${creada.folio}${creada.proveedor ? ` · ${creada.proveedor}` : ""}`,
			summary: `Entrada #${creada.folio}: ${lineas.length} renglón(es)${cfdi?.uuid ? " con CFDI" : ""}`,
			// The UUID and the totals, never the XML itself: the audit trail is not a document store,
			// and a stamped invoice pasted into every log row is a lot of bytes nobody reads there.
			after: {
				renglones: lineas.length,
				cfdiUuid: cfdi?.uuid ?? null,
				cfdiTotal: cfdi?.total ?? null,
				proveedor: creada.proveedor,
			},
		});

		return creada;
	});

	return entrada;
}

/**
 * A purchase that may or may not touch stock — the CFDI→cotización flow (nota-scoped): some
 * lines get checked "agregar a inventario" and open a layer, others exist only as a cotización
 * reference. Unlike `registrarEntrada` (a goods receipt, which makes no sense with zero goods),
 * `lineas` may be empty here — the entrada row still gets written as the purchase header so
 * `listComprasDeProveedor` has something to show even when nothing was stocked.
 */
export async function registrarCompra(input: {
	actor: Actor;
	cfdiXml: string;
	lineas: { productoId: string; cantidad: number; costoUnitario: number }[];
}) {
	if (!can(input.actor.role, "inventario:entrada")) throw new ClienteError(403, "Sin permiso: inventario:entrada");

	const cfdi = leerCfdi(input.cfdiXml);
	if (!cfdi) throw new ClienteError(400, "Ese archivo no parece un CFDI.");
	if (!cfdi.uuid) throw new ClienteError(400, "El CFDI no trae folio fiscal (UUID).");

	await exigirCfdiNoDuplicado(cfdi.uuid);
	await exigirProductosParaEntrada(input.lineas.map((l) => l.productoId));

	const proveedorId = cfdi.emisorRfc
		? await resolverProveedorPorCfdi(cfdi.emisorRfc, cfdi.emisorNombre ?? cfdi.emisorRfc)
		: null;

	const entrada = await prisma.$transaction(async (tx) => {
		const creada = await tx.inventario_entrada.create({
			data: {
				id: randomUUID(),
				proveedor: cfdi.emisorNombre,
				proveedorId,
				cfdiUuid: cfdi.uuid,
				cfdiEmisorRfc: cfdi.emisorRfc,
				cfdiEmisorNombre: cfdi.emisorNombre,
				cfdiTotal: cfdi.total !== null ? decDinero(cfdi.total) : null,
				cfdiFecha: cfdi.fecha,
				cfdiXml: input.cfdiXml,
				registradaPorId: input.actor.id,
			},
		});

		await abrirCapas(tx, { lineas: input.lineas, entradaId: creada.id, actor: input.actor });

		await recordAudit(tx, {
			action: "proveedor.compra",
			actor: input.actor,
			entityId: creada.id,
			entityLabel: `Compra #${creada.folio}${creada.proveedor ? ` · ${creada.proveedor}` : ""}`,
			summary: `Compra #${creada.folio}: ${input.lineas.length} renglón(es) a inventario, resto solo referencia`,
			after: {
				renglones: input.lineas.length,
				cfdiUuid: cfdi.uuid,
				cfdiTotal: cfdi.total,
				proveedorId,
			},
		});

		return creada;
	});

	return entrada;
}

// ================================================================================================
// Salida — el consumo FIFO
// ================================================================================================

/**
 * Issue stock, oldest layer first.
 *
 * Writes ONE movement per layer touched, each at that layer's cost. A single issue of 15 units
 * spanning three layers is three rows — which is exactly what makes cost of sale reconstructible
 * afterwards instead of being an average nobody can defend.
 *
 * Runs inside the caller's transaction: the movements, the layer balances and `producto.existencia`
 * commit together or not at all. Partial stock is refused outright rather than issuing what there
 * is — half a job's parts leaving the shelf without anybody being told is worse than a clear "no".
 */
export async function consumirFifo(
	tx: Prisma.TransactionClient,
	input: {
		actor: Actor;
		productoId: string;
		cantidad: number;
		notaId?: string | null;
		conceptoId?: string | null;
		motivo?: string | null;
	},
): Promise<{ costoTotal: number; movimientos: number }> {
	if (input.cantidad <= 0) throw new ClienteError(400, "La cantidad tiene que ser mayor a cero");

	const producto = await tx.producto.findUnique({
		where: { id: input.productoId },
		select: {
			id: true,
			nombre: true,
			unidad: true,
			controlaInventario: true,
			existencia: true,
			permiteNegativo: true,
			costoReferencia: true,
		},
	});
	if (!producto) throw new ClienteError(404, "Producto no encontrado");
	if (!producto.controlaInventario) throw new ClienteError(400, `${producto.nombre} no maneja inventario.`);

	if (!producto.permiteNegativo && Number(producto.existencia) < input.cantidad) {
		throw new ClienteError(
			409,
			`No alcanza: hay ${formatoCantidad(producto.existencia.toFixed(3))} ${producto.unidad} de ${producto.nombre} y se piden ${formatoCantidad(input.cantidad)}.`,
		);
	}

	const capas = await tx.inventario_capa.findMany({
		where: { productoId: producto.id, restante: { gt: 0 } },
		orderBy: [{ recibidaAt: "asc" }, { createdAt: "asc" }],
	});

	let porSurtir = input.cantidad;
	let costoTotal = 0;
	let movimientos = 0;
	let ultimoCosto = 0;

	for (const capa of capas) {
		if (porSurtir <= 0) break;
		const disponible = Number(capa.restante);
		const toma = Math.min(disponible, porSurtir);
		const costoUnitario = Number(capa.costoUnitario);
		ultimoCosto = costoUnitario;
		const costo = toma * costoUnitario;

		// Atomic decrement, not the absolute `disponible - toma` this read computed — the same
		// reason `producto.existencia` below uses `decrement` instead of a computed value. Two
		// concurrent consumptions reading this same layer before either commits would otherwise
		// silently overwrite one another's decrement (a lost update); with `decrement`, the DB does
		// the subtraction itself, and if that ever pushes `restante` past what the `>= 0` CHECK
		// constraint allows, the write fails loudly and the whole transaction rolls back — instead
		// of quietly leaving the layer ledger disagreeing with `existencia`.
		await tx.inventario_capa.update({
			where: { id: capa.id },
			data: { restante: { decrement: dec(toma) } },
		});

		await tx.inventario_movimiento.create({
			data: {
				id: randomUUID(),
				productoId: producto.id,
				tipo: "salida",
				cantidad: dec(toma),
				costoUnitario: capa.costoUnitario,
				costoTotal: decDinero(costo),
				capaId: capa.id,
				notaId: input.notaId ?? null,
				conceptoId: input.conceptoId ?? null,
				motivo: input.motivo ?? null,
				registradoPorId: input.actor.id,
			},
		});

		porSurtir -= toma;
		costoTotal += costo;
		movimientos++;
	}

	if (porSurtir > 0.0005) {
		if (!producto.permiteNegativo) {
			// `existencia` said there was enough but the layers did not add up. That is real
			// corruption, not a business case — refuse loudly and let the transaction roll back
			// rather than issue a short quantity and quietly leave the denormalized number lying.
			throw new ClienteError(
				500,
				`Inconsistencia de inventario en ${producto.nombre}: la existencia no coincide con las capas. No se aplicó nada.`,
			);
		}

		// No layer left behind the remainder — the shop ran out and sold it anyway. One more
		// movement, uncosted by any real layer: last layer's cost if one existed, else the
		// manual cost basis, else 0 (a warning-worthy edge: nothing here prices this shortage).
		const costoUnitario = ultimoCosto || Number(producto.costoReferencia ?? 0);
		const costo = porSurtir * costoUnitario;

		await tx.inventario_movimiento.create({
			data: {
				id: randomUUID(),
				productoId: producto.id,
				tipo: "salida",
				cantidad: dec(porSurtir),
				costoUnitario: decCosto(costoUnitario),
				costoTotal: decDinero(costo),
				capaId: null,
				notaId: input.notaId ?? null,
				conceptoId: input.conceptoId ?? null,
				motivo: input.motivo ?? null,
				registradoPorId: input.actor.id,
			},
		});

		costoTotal += costo;
		movimientos++;
	}

	await tx.producto.update({
		where: { id: producto.id },
		data: { existencia: { decrement: dec(input.cantidad) } },
	});

	return { costoTotal, movimientos };
}

// ================================================================================================
// Ajuste
// ================================================================================================

/**
 * Correct stock after a physical count, breakage or theft. **Always requires a reason** — enforced
 * here and again by `inventario_ajuste_motivo_check`.
 *
 * An increase opens a layer, because stock with no cost behind it makes every later margin wrong.
 * The cost defaults to the newest layer's, which is the closest honest guess for something that
 * turned up on the shelf.
 */
export async function ajustarExistencia(input: {
	actor: Actor;
	productoId: string;
	nueva: unknown;
	motivo: unknown;
	costoUnitario?: unknown;
}) {
	if (!can(input.actor.role, "inventario:ajuste")) throw new ClienteError(403, "Sin permiso: inventario:ajuste");

	const motivo = trim(input.motivo, 255, "El motivo");
	if (!motivo) throw new ClienteError(400, "Un ajuste de inventario tiene que decir por qué");

	const nueva = cantidad(input.nueva);
	if (nueva === null) throw new ClienteError(400, "La nueva existencia no es una cantidad válida");

	const producto = await getProducto(input.productoId);
	if (!producto.controlaInventario) throw new ClienteError(400, `${producto.nombre} no maneja inventario.`);

	const actual = Number(producto.existencia);
	const delta = nueva - actual;
	if (Math.abs(delta) < 0.0005) throw new ClienteError(409, "La existencia ya es esa.");

	await prisma.$transaction(async (tx) => {
		if (delta > 0) {
			const ultima = await tx.inventario_capa.findFirst({
				where: { productoId: producto.id },
				orderBy: [{ recibidaAt: "desc" }, { createdAt: "desc" }],
				select: { costoUnitario: true },
			});
			const costo = cantidad(input.costoUnitario) ?? Number(ultima?.costoUnitario ?? 0);

			const capa = await tx.inventario_capa.create({
				data: {
					id: randomUUID(),
					productoId: producto.id,
					cantidad: dec(delta),
					restante: dec(delta),
					costoUnitario: decCosto(costo),
				},
			});

			await tx.inventario_movimiento.create({
				data: {
					id: randomUUID(),
					productoId: producto.id,
					tipo: "ajuste",
					cantidad: dec(delta),
					costoUnitario: decCosto(costo),
					costoTotal: decDinero(delta * costo),
					capaId: capa.id,
					motivo,
					registradoPorId: input.actor.id,
				},
			});

			await tx.producto.update({ where: { id: producto.id }, data: { existencia: dec(nueva) } });
		} else {
			// A downward adjustment consumes layers FIFO like any other issue, so the cost that left
			// the shelf is the cost that was actually on it.
			await consumirFifo(tx, {
				actor: input.actor,
				productoId: producto.id,
				cantidad: -delta,
				motivo,
			});
			// consumirFifo wrote `salida` rows; relabel them so a shrinkage never reads as a sale.
			await tx.inventario_movimiento.updateMany({
				where: { productoId: producto.id, motivo, tipo: "salida", notaId: null, conceptoId: null },
				data: { tipo: "ajuste" },
			});
		}

		await recordAudit(tx, {
			action: "inventario.ajuste",
			actor: input.actor,
			entityId: producto.id,
			entityLabel: producto.nombre,
			summary: `Ajuste de ${producto.nombre}: ${formatoCantidad(actual)} → ${formatoCantidad(nueva)} (${motivo})`,
			before: { existencia: actual },
			after: { existencia: nueva, motivo },
		});
	});

	return getProducto(producto.id);
}

// ================================================================================================
// Solicitudes de refacción — lo único que el mecánico escribe en el inventario
// ================================================================================================

export const publicSolicitud = (s: {
	id: string;
	notaId: string;
	descripcion: string;
	productoId: string | null;
	cantidad: Prisma.Decimal;
	estado: string;
	resolucionMotivo: string | null;
	createdAt: Date;
	resueltaAt: Date | null;
	producto?: { nombre: string; unidad: string; existencia: Prisma.Decimal } | null;
	solicitadaPor?: { name: string } | null;
	resueltaPor?: { name: string } | null;
	nota?: { folio: number } | null;
}) => ({
	id: s.id,
	notaId: s.notaId,
	notaFolio: s.nota?.folio ?? null,
	descripcion: s.descripcion,
	productoId: s.productoId,
	productoNombre: s.producto?.nombre ?? null,
	unidad: s.producto?.unidad ?? null,
	existencia: s.producto?.existencia.toFixed(3) ?? null,
	cantidad: s.cantidad.toFixed(3),
	estado: s.estado,
	resolucionMotivo: s.resolucionMotivo,
	solicitadaPor: s.solicitadaPor?.name ?? null,
	resueltaPor: s.resueltaPor?.name ?? null,
	resueltaAt: s.resueltaAt?.toISOString() ?? null,
	createdAt: s.createdAt.toISOString(),
});

const SOLICITUD_INCLUDE = {
	producto: { select: { nombre: true, unidad: true, existencia: true } },
	solicitadaPor: { select: { name: true } },
	resueltaPor: { select: { name: true } },
	nota: { select: { folio: true } },
} satisfies Prisma.solicitud_refaccionInclude;

export async function listSolicitudes(query: { notaId?: string | null; estado?: string | null }) {
	const rows = await prisma.solicitud_refaccion.findMany({
		where: {
			...(query.notaId ? { notaId: query.notaId } : {}),
			...(query.estado ? { estado: query.estado } : {}),
		},
		orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
		take: 200,
		include: SOLICITUD_INCLUDE,
	});
	return rows.map(publicSolicitud);
}

/**
 * A mechanic asks for a part.
 *
 * Asking is not taking: this writes NO movement. Somebody at the counter fills it — which is what
 * issues the stock — or turns it down with a reason. The request is also the record of the gap
 * between what a job needed and what the shop had on the shelf, which is the thing that tells you
 * what to keep in stock.
 */
export async function solicitarRefaccion(input: { actor: Actor; notaId: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "inventario:solicitar")) {
		throw new ClienteError(403, "Sin permiso: inventario:solicitar");
	}

	const descripcion = trim(input.body.descripcion, 500, "La descripción");
	if (!descripcion) throw new ClienteError(400, "Di qué refacción necesitas");

	const cant = cantidad(input.body.cantidad) ?? 1;
	if (cant <= 0) throw new ClienteError(400, "La cantidad tiene que ser mayor a cero");

	const nota = await prisma.nota_servicio.findUnique({
		where: { id: input.notaId },
		select: { id: true, folio: true, estado: true },
	});
	if (!nota) throw new ClienteError(404, "Nota no encontrada");
	if (nota.estado === "entregada" || nota.estado === "cancelada") {
		throw new ClienteError(409, "Esa nota ya está cerrada.");
	}
	// A mechanic may only ask against a job their taller holds. The counter can ask on anyone's
	// behalf. Same boundary `exigirNotaPropia` uses in notas.ts — not a hand-rolled `mecanicoId`
	// comparison, which nothing in the panel writes anymore and would 404/403 every legitimate job.
	if (!can(input.actor.role, "nota:read")) {
		const propia = await prisma.nota_servicio.findFirst({
			where: { id: nota.id, ...alcanceDeTaller(input.actor) },
			select: { id: true },
		});
		if (!propia) throw new ClienteError(404, "Nota no encontrada");
	}

	const productoId = trim(input.body.productoId);
	if (productoId) {
		const existe = await prisma.producto.findUnique({ where: { id: productoId }, select: { id: true } });
		if (!existe) throw new ClienteError(404, "Ese producto no existe");
	}

	const solicitud = await prisma.$transaction(async (tx) => {
		const creada = await tx.solicitud_refaccion.create({
			data: {
				id: randomUUID(),
				notaId: nota.id,
				descripcion,
				productoId,
				cantidad: dec(cant),
				solicitadaPorId: input.actor.id,
			},
			include: SOLICITUD_INCLUDE,
		});

		await recordAudit(tx, {
			action: "refaccion.solicitud",
			actor: input.actor,
			entityId: creada.id,
			entityLabel: `Nota #${nota.folio} · ${descripcion}`,
			summary: `Refacción solicitada en la nota #${nota.folio}: ${formatoCantidad(cant)} × ${descripcion}`,
			after: { descripcion, cantidad: cant, productoId },
		});

		return creada;
	});

	await notificar({
		evento: "refaccion_solicitada",
		destino: { difusion: true },
		titulo: "Piden una refacción",
		cuerpo: `Nota #${nota.folio}: ${formatoCantidad(cant)} × ${descripcion}`,
		url: `/panel/notas/${nota.id}`,
		entidad: "nota",
		entidadId: nota.id,
		excepto: input.actor.id,
	});

	return publicSolicitud(solicitud);
}

/**
 * Fill or refuse a request.
 *
 * Filling it is what issues the stock, in the same transaction — so a request can never be marked
 * surtida without the movements that back it, and the mechanic never sees "yes" for a part that
 * never left the shelf.
 */
export async function resolverSolicitud(input: { actor: Actor; id: string; estado: string; motivo?: unknown }) {
	if (!can(input.actor.role, "inventario:salida")) throw new ClienteError(403, "Sin permiso: inventario:salida");

	const actual = await prisma.solicitud_refaccion.findUnique({
		where: { id: input.id },
		include: { nota: { select: { folio: true } } },
	});
	if (!actual) throw new ClienteError(404, "Solicitud no encontrada");
	if (actual.estado !== "pendiente") throw new ClienteError(409, "Esa solicitud ya se resolvió.");

	if (input.estado !== "surtida" && input.estado !== "rechazada") {
		throw new ClienteError(400, "Decide si se surte o no.");
	}

	const motivo = trim(input.motivo, 500, "El motivo");
	if (input.estado === "rechazada" && !motivo) {
		throw new ClienteError(400, "Di por qué no se puede surtir; es lo que lee el mecánico.");
	}
	if (input.estado === "surtida" && !actual.productoId) {
		throw new ClienteError(
			400,
			"Para surtirla hay que decir qué producto del catálogo es. Si no existe, dala de alta o recházala.",
		);
	}

	const solicitud = await prisma.$transaction(async (tx) => {
		// Claim atomically before doing anything else in this transaction — `actual.estado` above
		// was read outside it, so a concurrent duplicate call (double-click, two tabs) could pass
		// that same read before either commits. `updateMany` accepts a non-unique filter where
		// `update` doesn't; a `count` of 0 means somebody else's call already claimed this solicitud
		// a moment ago, and this one backs off instead of also consuming inventory for it.
		const claimada = await tx.solicitud_refaccion.updateMany({
			where: { id: actual.id, estado: "pendiente" },
			data: {
				estado: input.estado,
				resolucionMotivo: motivo,
				resueltaPorId: input.actor.id,
				resueltaAt: new Date(),
			},
		});
		if (claimada.count === 0) throw new ClienteError(409, "Esa solicitud ya se resolvió.");

		if (input.estado === "surtida") {
			await consumirFifo(tx, {
				actor: input.actor,
				productoId: actual.productoId!,
				cantidad: Number(actual.cantidad),
				notaId: actual.notaId,
				motivo: `Solicitud de refacción · nota #${actual.nota.folio}`,
			});
		}

		const guardada = await tx.solicitud_refaccion.findUniqueOrThrow({
			where: { id: actual.id },
			include: SOLICITUD_INCLUDE,
		});

		await recordAudit(tx, {
			action: input.estado === "surtida" ? "refaccion.surtida" : "refaccion.rechazada",
			actor: input.actor,
			entityId: guardada.id,
			entityLabel: `Nota #${actual.nota.folio} · ${guardada.descripcion}`,
			summary:
				input.estado === "surtida"
					? `Refacción surtida: ${formatoCantidad(Number(guardada.cantidad))} × ${guardada.descripcion}`
					: `Refacción no disponible: ${guardada.descripcion} — ${motivo}`,
			before: { estado: "pendiente" },
			after: { estado: input.estado, motivo },
		});

		return guardada;
	});

	// Tell the mechanic who asked. Directed, not broadcast: it is only actionable for them.
	if (actual.solicitadaPorId) {
		await notificar({
			evento: "refaccion_resuelta",
			destino: { userId: actual.solicitadaPorId },
			titulo: input.estado === "surtida" ? "Ya está tu refacción" : "No hay esa refacción",
			cuerpo:
				input.estado === "surtida"
					? `Nota #${actual.nota.folio}: ${actual.descripcion}. Pásala a recoger.`
					: `Nota #${actual.nota.folio}: ${actual.descripcion}. ${motivo}`,
			url: `/panel/taller/${actual.notaId}`,
			entidad: "nota",
			entidadId: actual.notaId,
			excepto: input.actor.id,
		});
	}

	return publicSolicitud(solicitud);
}
