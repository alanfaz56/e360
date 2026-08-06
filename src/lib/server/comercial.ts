import { randomUUID } from "node:crypto";
// `Prisma` is used as a VALUE here (Prisma.Decimal), not only as a type namespace.
import { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import {
	IVA,
	centavos,
	conceptoTipoLabel,
	cotizacionEstadoLabel,
	esCredito,
	facturaEstadoLabel,
	importeConcepto,
	isCondicionPago,
	isConceptoTipo,
	isCotizacionEstado,
	isMetodoPago,
	metodoPagoLabel,
	pesos,
	puedeTransicionarCotizacion,
	totales,
	type CotizacionEstado,
} from "$lib/comercial";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import { avisarClienteDeNota, notificar } from "./notificaciones";
import { pageMeta, parsePageParams, skipFor, type PageParams } from "./paginate";
import type { Actor } from "./guard";

/**
 * Quotes, invoices, payments and the credit limit.
 *
 * Money is handled as integer CENTS (`bigint`) everywhere it is added up, and only becomes a
 * `Decimal` string at the database boundary. Totals are always RECOMPUTED from the line items —
 * a total sent by a client is a number nobody checked.
 */

const dec = (cents: bigint) => new Prisma.Decimal(pesos(cents));
const aCentavos = (d: Prisma.Decimal | string | null | undefined): bigint =>
	d === null || d === undefined ? 0n : (centavos(d.toString()) ?? 0n);

/**
 * A money column as it goes out over the API.
 *
 * ALWAYS two decimals: `Decimal.toString()` drops trailing zeros, so a total of 5050.00 would
 * serialize as "5050" and an integrator parsing it would silently disagree with the invoice.
 */
const monto = (d: Prisma.Decimal) => d.toFixed(2);

// --- Cotizaciones ----------------------------------------------------------------------------

const COTIZACION_INCLUDE = {
	conceptos: { orderBy: { orden: "asc" } },
	nota: { select: { folio: true, clienteId: true, cliente: { select: { nombreCompleto: true, tipo: true } } } },
	autorizadaPorContacto: { select: { nombre: true } },
	creadaPor: { select: { name: true } },
} satisfies Prisma.cotizacionInclude;

type CotizacionRow = Prisma.cotizacionGetPayload<{ include: typeof COTIZACION_INCLUDE }>;

export const publicCotizacion = (c: CotizacionRow) => ({
	id: c.id,
	folio: c.folio,
	notaId: c.notaId,
	notaFolio: c.nota?.folio ?? null,
	clienteNombre: c.nota?.cliente?.nombreCompleto ?? null,
	estado: c.estado,
	estadoLabel: cotizacionEstadoLabel(c.estado),
	subtotal: monto(c.subtotal),
	iva: monto(c.iva),
	total: monto(c.total),
	vigenciaHasta: c.vigenciaHasta?.toISOString() ?? null,
	notas: c.notas,
	enviadaAt: c.enviadaAt?.toISOString() ?? null,
	autorizadaPorContactoId: c.autorizadaPorContactoId,
	autorizadaPorNombre: c.autorizadaPorContacto?.nombre ?? null,
	autorizadaMedio: c.autorizadaMedio,
	autorizadaAt: c.autorizadaAt?.toISOString() ?? null,
	rechazadaMotivo: c.rechazadaMotivo,
	creadaPor: c.creadaPor?.name ?? null,
	conceptos: c.conceptos.map((x) => ({
		id: x.id,
		tipo: x.tipo,
		tipoLabel: conceptoTipoLabel(x.tipo),
		descripcion: x.descripcion,
		cantidad: x.cantidad.toFixed(2),
		precioUnitario: monto(x.precioUnitario),
		importe: monto(x.importe),
	})),
	createdAt: c.createdAt.toISOString(),
});

export async function getCotizacion(id: string) {
	const cotizacion = await prisma.cotizacion.findUnique({ where: { id }, include: COTIZACION_INCLUDE });
	if (!cotizacion) throw new ClienteError(404, "Cotización no encontrada");
	return cotizacion;
}

export async function listCotizaciones(query: { notaId?: string | null } & Partial<PageParams>) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 25 };
	const where: Prisma.cotizacionWhereInput = query.notaId ? { notaId: query.notaId } : {};

	const [total, rows] = await Promise.all([
		prisma.cotizacion.count({ where }),
		prisma.cotizacion.findMany({
			where,
			orderBy: { createdAt: "desc" },
			skip: skipFor(paging),
			take: paging.perPage,
			include: COTIZACION_INCLUDE,
		}),
	]);
	return { cotizaciones: rows.map(publicCotizacion), ...pageMeta(total, paging) };
}

/** Line items from the request, validated. Amounts are recomputed, never taken on trust. */
function leerConceptos(value: unknown) {
	if (!Array.isArray(value) || value.length === 0) {
		throw new ClienteError(400, "Agrega al menos un concepto");
	}
	return value.map((raw, i) => {
		const c = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
		if (!isConceptoTipo(c.tipo)) throw new ClienteError(400, `Concepto ${i + 1}: tipo inválido`);

		const descripcion = trim(c.descripcion, 500, `La descripción del concepto ${i + 1}`);
		if (!descripcion) throw new ClienteError(400, `Concepto ${i + 1}: falta la descripción`);

		const cantidad = Number(c.cantidad);
		if (!Number.isFinite(cantidad) || cantidad <= 0) {
			throw new ClienteError(400, `Concepto ${i + 1}: la cantidad debe ser mayor que cero`);
		}
		const precioUnitario = centavos(c.precioUnitario);
		if (precioUnitario === null) {
			throw new ClienteError(400, `Concepto ${i + 1}: precio inválido (usa 1234.50)`);
		}

		return {
			tipo: c.tipo,
			descripcion,
			cantidad,
			precioUnitario,
			importe: importeConcepto(cantidad, precioUnitario),
			orden: i,
		};
	});
}

export async function crearCotizacion(input: { actor: Actor; notaId: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cotizacion:create")) {
		throw new ClienteError(403, "Sin permiso: cotizacion:create");
	}

	const nota = await prisma.nota_servicio.findUnique({
		where: { id: input.notaId },
		select: { id: true, folio: true, estado: true },
	});
	if (!nota) throw new ClienteError(404, "Nota de servicio no encontrada");
	if (nota.estado === "cancelada") throw new ClienteError(409, "Una nota cancelada ya no se cotiza.");

	const conceptos = leerConceptos(input.body.conceptos);
	const { subtotal, iva, total } = totales(conceptos);

	const cotizacion = await prisma.$transaction(async (tx) => {
		const creada = await tx.cotizacion.create({
			data: {
				id: randomUUID(),
				notaId: nota.id,
				estado: "borrador",
				subtotal: dec(subtotal),
				iva: dec(iva),
				total: dec(total),
				vigenciaHasta: leerFechaOpcional(input.body.vigenciaHasta),
				notas: trim(input.body.notas),
				creadaPorId: input.actor.id,
				conceptos: {
					create: conceptos.map((c) => ({
						id: randomUUID(),
						tipo: c.tipo,
						descripcion: c.descripcion,
						cantidad: new Prisma.Decimal(c.cantidad),
						precioUnitario: dec(c.precioUnitario),
						importe: dec(c.importe),
						orden: c.orden,
					})),
				},
			},
			include: COTIZACION_INCLUDE,
		});

		await recordAudit(tx, {
			action: "cotizacion.create",
			actor: input.actor,
			entityId: creada.id,
			entityLabel: `Cotización #${creada.folio} (nota #${nota.folio})`,
			summary: `Cotización #${creada.folio} por ${pesos(total)} en la nota #${nota.folio}`,
			after: { total: pesos(total), conceptos: conceptos.length },
		});

		return creada;
	});

	return cotizacion;
}

/** Only a `borrador` is editable: once the customer has seen it, the numbers are frozen. */
export async function actualizarCotizacion(input: {
	actor: Actor;
	id: string;
	body: Record<string, unknown>;
}) {
	if (!can(input.actor.role, "cotizacion:create")) {
		throw new ClienteError(403, "Sin permiso: cotizacion:create");
	}

	const current = await getCotizacion(input.id);
	if (current.estado !== "borrador") {
		throw new ClienteError(
			409,
			`Una cotización ${cotizacionEstadoLabel(current.estado).toLowerCase()} ya no se edita. Haz una nueva.`,
		);
	}

	const conceptos = leerConceptos(input.body.conceptos);
	const { subtotal, iva, total } = totales(conceptos);

	const cotizacion = await prisma.$transaction(async (tx) => {
		await tx.cotizacion_concepto.deleteMany({ where: { cotizacionId: current.id } });
		const actualizada = await tx.cotizacion.update({
			where: { id: current.id },
			data: {
				subtotal: dec(subtotal),
				iva: dec(iva),
				total: dec(total),
				vigenciaHasta: leerFechaOpcional(input.body.vigenciaHasta) ?? current.vigenciaHasta,
				notas: input.body.notas !== undefined ? trim(input.body.notas) : current.notas,
				conceptos: {
					create: conceptos.map((c) => ({
						id: randomUUID(),
						tipo: c.tipo,
						descripcion: c.descripcion,
						cantidad: new Prisma.Decimal(c.cantidad),
						precioUnitario: dec(c.precioUnitario),
						importe: dec(c.importe),
						orden: c.orden,
					})),
				},
			},
			include: COTIZACION_INCLUDE,
		});

		await recordAudit(tx, {
			action: "cotizacion.update",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: `Cotización #${actualizada.folio}`,
			summary: `Cotización #${actualizada.folio} actualizada a ${pesos(total)}`,
			before: { total: current.total.toString() },
			after: { total: pesos(total), conceptos: conceptos.length },
		});

		return actualizada;
	});

	return cotizacion;
}

function leerFechaOpcional(value: unknown): Date | null {
	if (typeof value !== "string" || value === "") return null;
	const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59-07:00`) : new Date(value);
	if (Number.isNaN(d.getTime())) throw new ClienteError(400, "Fecha de vigencia inválida");
	return d;
}

/** Move a quote along. Sending needs `cotizacion:send`; recording the answer does not. */
export async function cambiarEstadoCotizacion(input: {
	actor: Actor;
	id: string;
	estado: unknown;
	body?: Record<string, unknown>;
}) {
	const destino = input.estado;
	if (!isCotizacionEstado(destino)) throw new ClienteError(400, "Estado inválido");

	const permiso = destino === "enviada" ? "cotizacion:send" : "cotizacion:authorize";
	if (!can(input.actor.role, permiso)) throw new ClienteError(403, `Sin permiso: ${permiso}`);

	const current = await getCotizacion(input.id);
	if (!puedeTransicionarCotizacion(current.estado, destino)) {
		throw new ClienteError(
			409,
			`No se puede pasar de ${cotizacionEstadoLabel(current.estado)} a ${cotizacionEstadoLabel(destino)}.`,
		);
	}

	const body = input.body ?? {};
	const data: Prisma.cotizacionUpdateInput = { estado: destino as CotizacionEstado };

	if (destino === "enviada") data.enviadaAt = new Date();

	if (destino === "rechazada") {
		const motivo = trim(body.motivo, 500, "El motivo");
		if (!motivo) throw new ClienteError(400, "Anota por qué la rechazó el cliente");
		data.rechazadaMotivo = motivo;
	}

	if (destino === "autorizada") {
		// WHO approved it, on the customer's side. An organización cannot approve its own quote —
		// somebody with the `autorizador` role has to, which is the entire reason that role exists.
		const contactoId = trim(body.contactoId);
		if (contactoId) {
			const contacto = await prisma.cliente_contacto.findUnique({
				where: { id: contactoId },
				select: { clienteId: true, roles: true, nombre: true, archivedAt: true },
			});
			if (!contacto) throw new ClienteError(404, "Contacto no encontrado");
			if (contacto.clienteId !== current.nota.clienteId) {
				throw new ClienteError(400, "Ese contacto pertenece a otro cliente");
			}
			if (contacto.archivedAt) throw new ClienteError(409, "Ese contacto está archivado.");
			if (!contacto.roles.includes("autorizador")) {
				throw new ClienteError(
					400,
					`${contacto.nombre} no tiene el rol de Autorizador. Agrégaselo en la ficha del cliente.`,
				);
			}
			data.autorizadaPorContacto = { connect: { id: contactoId } };
		} else if (current.nota.cliente?.tipo === "organizacion") {
			throw new ClienteError(
				400,
				"Una organización no autoriza por sí misma: indica qué contacto con rol de Autorizador aprobó.",
			);
		}
		data.autorizadaMedio = trim(body.medio, 60, "El medio");
		data.autorizadaAt = new Date();
	}

	const cotizacion = await prisma.$transaction(async (tx) => {
		const actualizada = await tx.cotizacion.update({
			where: { id: current.id },
			data,
			include: COTIZACION_INCLUDE,
		});
		await recordAudit(tx, {
			action:
				destino === "enviada"
					? "cotizacion.send"
					: destino === "autorizada"
						? "cotizacion.authorize"
						: "cotizacion.reject",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: `Cotización #${actualizada.folio}`,
			summary: `Cotización #${actualizada.folio}: ${cotizacionEstadoLabel(current.estado)} → ${cotizacionEstadoLabel(destino)}`,
			before: { estado: current.estado },
			after: {
				estado: destino,
				total: actualizada.total.toString(),
				autorizadaPor: actualizada.autorizadaPorContacto?.nombre ?? null,
				medio: actualizada.autorizadaMedio,
			},
		});
		return actualizada;
	});

	if (destino === "enviada") {
		await avisarClienteDeNota(cotizacion.notaId, {
			evento: "cliente_cotizacion",
			titulo: "Tu cotización está lista",
			cuerpo: `Cotización #${cotizacion.folio} por $${monto(cotizacion.total)}. Ábrela para autorizarla o rechazarla.`,
		});
	} else if (destino === "autorizada" || destino === "rechazada") {
		// The answer is what unblocks the work, so it goes to whoever can act on it — not just to
		// the person who happened to send the quote.
		await notificar({
			evento: "cotizacion_respondida",
			destino: { difusion: true },
			titulo: destino === "autorizada" ? "Cotización autorizada" : "Cotización rechazada",
			cuerpo: `#${cotizacion.folio} · $${monto(cotizacion.total)} — ${cotizacion.nota.cliente.nombreCompleto}`,
			url: `/panel/notas/${cotizacion.notaId}`,
			entidad: "nota",
			entidadId: cotizacion.notaId,
			excepto: input.actor.id,
		});
	}

	return cotizacion;
}

// --- Crédito ---------------------------------------------------------------------------------

/**
 * What the customer currently owes: issued credit invoices, minus everything paid against them.
 *
 * Cancelled invoices do not count, and neither do cash ones — only credit consumes the limit.
 */
export async function saldoCliente(clienteId: string) {
	const facturas = await prisma.factura.findMany({
		where: { clienteId, condicionPago: "credito", estado: { in: ["emitida", "pagada"] } },
		select: { total: true, pagos: { select: { monto: true } } },
	});

	let facturado = 0n;
	let pagado = 0n;
	for (const f of facturas) {
		facturado += aCentavos(f.total);
		for (const p of f.pagos) pagado += aCentavos(p.monto);
	}

	const cliente = await prisma.cliente.findUnique({
		where: { id: clienteId },
		select: { limiteCredito: true, diasCredito: true },
	});

	const limite = cliente?.limiteCredito ? aCentavos(cliente.limiteCredito) : null;
	const saldo = facturado - pagado;

	return {
		facturado: pesos(facturado),
		pagado: pesos(pagado),
		saldo: pesos(saldo),
		limite: limite === null ? null : pesos(limite),
		disponible: limite === null ? null : pesos(limite - saldo),
		diasCredito: cliente?.diasCredito ?? null,
		saldoCents: saldo,
		limiteCents: limite,
	};
}

/**
 * Guard a credit sale against the customer's limit.
 *
 * Refuses by default, naming the balance and the overage — a number the counter can actually
 * repeat to the customer. Admin/Gerente may override with a reason, and that override is its own
 * audit entry: the exception has to be visible, not invisible.
 */
async function asegurarCredito(
	db: Prisma.TransactionClient,
	input: { actor: Actor; clienteId: string; montoCents: bigint; forzar: boolean; motivo: string | null },
) {
	const estado = await saldoCliente(input.clienteId);

	if (estado.limiteCents === null) {
		throw new ClienteError(
			409,
			"Este cliente no tiene crédito autorizado. Cobra de contado o asígnale un límite.",
		);
	}

	const nuevoSaldo = estado.saldoCents + input.montoCents;
	if (nuevoSaldo <= estado.limiteCents) return;

	const excede = nuevoSaldo - estado.limiteCents;
	if (!input.forzar) {
		throw new ClienteError(
			409,
			`Excede su límite de crédito por $${pesos(excede)}. Saldo actual $${estado.saldo} de $${estado.limite}.`,
		);
	}

	if (!can(input.actor.role, "cliente:credito")) {
		throw new ClienteError(
			403,
			`Excede su límite por $${pesos(excede)}. Solo un Gerente o Admin puede autorizarlo.`,
		);
	}
	if (!input.motivo) {
		throw new ClienteError(400, "Para pasar el límite de crédito hay que anotar el motivo");
	}

	await recordAudit(db, {
		action: "cliente.credito_override",
		actor: input.actor,
		entityId: input.clienteId,
		entityLabel: `$${pesos(nuevoSaldo)} de $${estado.limite}`,
		summary: `Venta a crédito autorizada sobre el límite por $${pesos(excede)}: ${input.motivo}`,
		before: { saldo: estado.saldo, limite: estado.limite },
		after: { saldoResultante: pesos(nuevoSaldo), excede: pesos(excede), motivo: input.motivo },
	});
}

/** Set or clear a customer's credit terms. Both fields move together — a CHECK enforces it too. */
export async function actualizarCredito(input: {
	actor: Actor;
	clienteId: string;
	body: Record<string, unknown>;
}) {
	if (!can(input.actor.role, "cliente:credito")) {
		throw new ClienteError(403, "Sin permiso: cliente:credito");
	}

	const cliente = await prisma.cliente.findUnique({
		where: { id: input.clienteId },
		select: { id: true, nombreCompleto: true, limiteCredito: true, diasCredito: true },
	});
	if (!cliente) throw new ClienteError(404, "Cliente no encontrado");

	const sinCredito =
		input.body.limiteCredito === "" ||
		input.body.limiteCredito === null ||
		input.body.limiteCredito === undefined;

	let limite: bigint | null = null;
	let dias: number | null = null;

	if (!sinCredito) {
		limite = centavos(input.body.limiteCredito);
		if (limite === null) throw new ClienteError(400, "Límite de crédito inválido (usa 50000.00)");
		const d = Number(input.body.diasCredito);
		if (!Number.isInteger(d) || d < 0 || d > 365) {
			throw new ClienteError(400, "Los días de crédito deben ir de 0 a 365");
		}
		dias = d;
	}

	const actualizado = await prisma.$transaction(async (tx) => {
		const row = await tx.cliente.update({
			where: { id: cliente.id },
			data: { limiteCredito: limite === null ? null : dec(limite), diasCredito: dias },
		});
		await recordAudit(tx, {
			action: "cliente.credito",
			actor: input.actor,
			entityId: cliente.id,
			entityLabel: cliente.nombreCompleto,
			summary: sinCredito
				? `Crédito retirado a ${cliente.nombreCompleto}`
				: `Crédito de ${cliente.nombreCompleto}: $${pesos(limite!)} a ${dias} días`,
			before: {
				limite: cliente.limiteCredito?.toString() ?? null,
				dias: cliente.diasCredito,
			},
			after: { limite: limite === null ? null : pesos(limite), dias },
		});
		return row;
	});

	return actualizado;
}

// --- Facturas --------------------------------------------------------------------------------

const FACTURA_INCLUDE = {
	cliente: { select: { nombreCompleto: true, rfc: true } },
	nota: { select: { folio: true } },
	pagos: { orderBy: { pagadoAt: "asc" }, include: { registradoPor: { select: { name: true } } } },
} satisfies Prisma.facturaInclude;

type FacturaRow = Prisma.facturaGetPayload<{ include: typeof FACTURA_INCLUDE }>;

export const publicFactura = (f: FacturaRow) => {
	const pagado = f.pagos.reduce((s, p) => s + aCentavos(p.monto), 0n);
	const total = aCentavos(f.total);
	return {
		id: f.id,
		folio: f.folio,
		notaId: f.notaId,
		notaFolio: f.nota?.folio ?? null,
		clienteId: f.clienteId,
		clienteNombre: f.cliente?.nombreCompleto ?? null,
		clienteRfc: f.cliente?.rfc ?? null,
		cotizacionId: f.cotizacionId,
		estado: f.estado,
		estadoLabel: facturaEstadoLabel(f.estado),
		condicionPago: f.condicionPago,
		diasCredito: f.diasCredito,
		vence: f.vence?.toISOString() ?? null,
		subtotal: monto(f.subtotal),
		iva: monto(f.iva),
		total: monto(f.total),
		pagado: pesos(pagado),
		saldo: pesos(total - pagado),
		liquidada: pagado >= total,
		uuid: f.uuid,
		serie: f.serie,
		emitidaAt: f.emitidaAt?.toISOString() ?? null,
		canceladaAt: f.canceladaAt?.toISOString() ?? null,
		canceladoMotivo: f.canceladoMotivo,
		notas: f.notas,
		pagos: f.pagos.map((p) => ({
			id: p.id,
			monto: monto(p.monto),
			metodo: p.metodo,
			metodoLabel: metodoPagoLabel(p.metodo),
			referencia: p.referencia,
			notas: p.notas,
			pagadoAt: p.pagadoAt.toISOString(),
			registradoPor: p.registradoPor?.name ?? null,
		})),
		createdAt: f.createdAt.toISOString(),
	};
};

export async function getFactura(id: string) {
	const factura = await prisma.factura.findUnique({ where: { id }, include: FACTURA_INCLUDE });
	if (!factura) throw new ClienteError(404, "Factura no encontrada");
	return factura;
}

export async function listFacturas(
	query: { clienteId?: string | null; notaId?: string | null; estado?: string | null; vencidas?: boolean } & Partial<PageParams>,
) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 25 };
	const where: Prisma.facturaWhereInput = {
		...(query.clienteId ? { clienteId: query.clienteId } : {}),
		...(query.notaId ? { notaId: query.notaId } : {}),
		...(query.estado ? { estado: query.estado } : {}),
		...(query.vencidas ? { estado: "emitida", vence: { lt: new Date() } } : {}),
	};

	const [total, rows] = await Promise.all([
		prisma.factura.count({ where }),
		prisma.factura.findMany({
			where,
			orderBy: { createdAt: "desc" },
			skip: skipFor(paging),
			take: paging.perPage,
			include: FACTURA_INCLUDE,
		}),
	]);
	return { facturas: rows.map(publicFactura), ...pageMeta(total, paging) };
}

/**
 * Issue an invoice, from an authorized quote or from explicit line items.
 *
 * A credit sale checks the customer's limit BEFORE anything is written, inside the transaction,
 * so two invoices issued at the same instant cannot both slip under the same headroom.
 */
export async function crearFactura(input: { actor: Actor; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "factura:create")) throw new ClienteError(403, "Sin permiso: factura:create");

	const cotizacionId = trim(input.body.cotizacionId);
	let notaId = trim(input.body.notaId);
	let clienteId = trim(input.body.clienteId);
	let subtotal = 0n;
	let iva = 0n;
	let total = 0n;

	if (cotizacionId) {
		const cotizacion = await getCotizacion(cotizacionId);
		if (cotizacion.estado !== "autorizada") {
			throw new ClienteError(409, "Solo se factura una cotización autorizada por el cliente.");
		}
		const yaFacturada = await prisma.factura.count({
			where: { cotizacionId, estado: { not: "cancelada" } },
		});
		if (yaFacturada > 0) throw new ClienteError(409, "Esa cotización ya está facturada.");

		notaId ??= cotizacion.notaId;
		clienteId ??= cotizacion.nota.clienteId;
		subtotal = aCentavos(cotizacion.subtotal);
		iva = aCentavos(cotizacion.iva);
		total = aCentavos(cotizacion.total);
	} else {
		const conceptos = leerConceptos(input.body.conceptos);
		({ subtotal, iva, total } = totales(conceptos));
		if (notaId && !clienteId) {
			const nota = await prisma.nota_servicio.findUnique({
				where: { id: notaId },
				select: { clienteId: true },
			});
			if (!nota) throw new ClienteError(404, "Nota de servicio no encontrada");
			clienteId = nota.clienteId;
		}
	}

	if (!clienteId) throw new ClienteError(400, "Falta el cliente");

	const condicionPago = isCondicionPago(input.body.condicionPago) ? input.body.condicionPago : "contado";
	const forzar = input.body.forzarCredito === "1" || input.body.forzarCredito === true;
	const motivoCredito = trim(input.body.motivoCredito, 255, "El motivo");

	const factura = await prisma.$transaction(async (tx) => {
		let diasCredito: number | null = null;
		let vence: Date | null = null;

		if (esCredito(condicionPago)) {
			await asegurarCredito(tx, {
				actor: input.actor,
				clienteId: clienteId!,
				montoCents: total,
				forzar,
				motivo: motivoCredito,
			});
			const cliente = await tx.cliente.findUnique({
				where: { id: clienteId! },
				select: { diasCredito: true },
			});
			// Copied onto the invoice: changing the customer's terms later must never rewrite what
			// was already agreed on an issued document.
			diasCredito = cliente?.diasCredito ?? 0;
			vence = new Date(Date.now() + diasCredito * 86_400_000);
		}

		const creada = await tx.factura.create({
			data: {
				id: randomUUID(),
				notaId,
				clienteId: clienteId!,
				cotizacionId,
				estado: "emitida",
				condicionPago,
				diasCredito,
				vence,
				subtotal: dec(subtotal),
				iva: dec(iva),
				total: dec(total),
				serie: trim(input.body.serie, 25, "La serie"),
				emitidaAt: new Date(),
				notas: trim(input.body.notas),
				creadaPorId: input.actor.id,
			},
			include: FACTURA_INCLUDE,
		});

		await recordAudit(tx, {
			action: "factura.create",
			actor: input.actor,
			entityId: creada.id,
			entityLabel: `Factura #${creada.folio} · ${creada.cliente?.nombreCompleto}`,
			summary: `Factura #${creada.folio} por $${creada.total} (${condicionPago})`,
			after: {
				total: creada.total.toString(),
				condicionPago,
				diasCredito,
				vence: vence?.toISOString() ?? null,
				cotizacionId,
			},
		});

		return creada;
	});

	if (factura.notaId) {
		await avisarClienteDeNota(factura.notaId, {
			evento: "cliente_factura",
			titulo: "Tu factura está lista",
			cuerpo: `Factura #${factura.folio} por $${monto(factura.total)}${
				factura.vence ? `, con vencimiento ${factura.vence.toISOString().slice(0, 10)}` : ""
			}.`,
		});
	}

	return factura;
}

export async function cancelarFactura(input: { actor: Actor; id: string; motivo: unknown }) {
	if (!can(input.actor.role, "factura:cancel")) throw new ClienteError(403, "Sin permiso: factura:cancel");

	const motivo = trim(input.motivo, 255, "El motivo");
	if (!motivo) throw new ClienteError(400, "El motivo de la cancelación es obligatorio");

	const current = await getFactura(input.id);
	if (current.estado === "cancelada") throw new ClienteError(409, "Ya está cancelada.");
	if (current.pagos.length > 0) {
		throw new ClienteError(
			409,
			`No se cancela una factura con ${current.pagos.length} pago(s) registrado(s). Aplica una nota de crédito.`,
		);
	}

	const factura = await prisma.$transaction(async (tx) => {
		const actualizada = await tx.factura.update({
			where: { id: current.id },
			data: { estado: "cancelada", canceladaAt: new Date(), canceladoMotivo: motivo },
			include: FACTURA_INCLUDE,
		});
		await recordAudit(tx, {
			action: "factura.cancel",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: `Factura #${actualizada.folio}`,
			summary: `Factura #${actualizada.folio} cancelada: ${motivo}`,
			before: { estado: current.estado, total: current.total.toString() },
			after: { estado: "cancelada", motivo },
		});
		return actualizada;
	});

	return factura;
}

// --- Pagos -----------------------------------------------------------------------------------

/**
 * Register a payment, partial or full.
 *
 * The invoice becomes `pagada` when the payments cover it — computed here, never set by hand.
 * Overpayment is refused: a payment larger than the balance is a data-entry error nine times out
 * of ten, and the tenth is a credit note, which is a different document.
 */
export async function registrarPago(input: { actor: Actor; facturaId: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "pago:register")) throw new ClienteError(403, "Sin permiso: pago:register");

	const monto = centavos(input.body.monto);
	if (monto === null || monto === 0n) throw new ClienteError(400, "Monto inválido (usa 1234.50)");
	if (!isMetodoPago(input.body.metodo)) throw new ClienteError(400, "Método de pago inválido");

	const factura = await getFactura(input.facturaId);
	if (factura.estado === "cancelada") throw new ClienteError(409, "Esa factura está cancelada.");
	if (factura.estado === "borrador") throw new ClienteError(409, "Emite la factura antes de cobrarla.");

	const total = aCentavos(factura.total);
	const pagado = factura.pagos.reduce((s, p) => s + aCentavos(p.monto), 0n);
	const saldo = total - pagado;
	if (saldo <= 0n) throw new ClienteError(409, "Esa factura ya está saldada.");
	if (monto > saldo) {
		throw new ClienteError(400, `El pago pasa del saldo pendiente ($${pesos(saldo)}).`);
	}

	const pago = await prisma.$transaction(async (tx) => {
		const creado = await tx.pago.create({
			data: {
				id: randomUUID(),
				facturaId: factura.id,
				monto: dec(monto),
				metodo: input.body.metodo as string,
				referencia: trim(input.body.referencia, 120, "La referencia"),
				notas: trim(input.body.notas, 500, "Las notas"),
				pagadoAt: leerFechaOpcional(input.body.pagadoAt) ?? new Date(),
				registradoPorId: input.actor.id,
			},
		});

		// Reached by arithmetic, not by a button.
		if (pagado + monto >= total) {
			await tx.factura.update({ where: { id: factura.id }, data: { estado: "pagada" } });
		}

		await recordAudit(tx, {
			action: "pago.register",
			actor: input.actor,
			entityId: factura.id,
			entityLabel: `Factura #${factura.folio} · ${factura.cliente?.nombreCompleto}`,
			summary: `Pago de $${pesos(monto)} (${metodoPagoLabel(String(input.body.metodo))}) en la factura #${factura.folio}`,
			before: { pagado: pesos(pagado), saldo: pesos(saldo) },
			after: {
				pagado: pesos(pagado + monto),
				saldo: pesos(saldo - monto),
				liquidada: pagado + monto >= total,
			},
		});

		return creado;
	});

	const liquidada = pagado + monto >= total;

	await notificar({
		evento: "pago_registrado",
		destino: { difusion: true },
		titulo: liquidada ? "Factura saldada" : "Se registró un pago",
		cuerpo: `$${pesos(monto)} en la factura #${factura.folio} · ${factura.cliente?.nombreCompleto ?? ""}`,
		url: factura.notaId ? `/panel/notas/${factura.notaId}` : null,
		entidad: "factura",
		entidadId: factura.id,
		excepto: input.actor.id,
	});

	if (factura.notaId) {
		await avisarClienteDeNota(factura.notaId, {
			evento: "cliente_pago",
			titulo: "Recibimos tu pago",
			cuerpo: liquidada
				? `$${pesos(monto)}. La factura #${factura.folio} queda saldada. ¡Gracias!`
				: `$${pesos(monto)} en la factura #${factura.folio}. Saldo pendiente: $${pesos(saldo - monto)}.`,
		});
	}

	return pago;
}

export { IVA };
