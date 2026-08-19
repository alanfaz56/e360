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
	cotizacionInternaEstadoLabel,
	esCredito,
	facturaEstadoLabel,
	importeConcepto,
	isCondicionPago,
	isConceptoTipo,
	isCotizacionEstado,
	isCotizacionInterno,
	isCotizacionInternaEstado,
	isMetodoPago,
	metodoPagoLabel,
	pesos,
	puedeTransicionarCotizacion,
	puedeTransicionarCotizacionInterna,
	puedeTransicionarInterno,
	cotizacionInternoLabel,
	totales,
	margenPorcentaje,
	utilidadCotizacion,
	type CotizacionEstado,
} from "$lib/comercial";
import { diasEntre, enZona, fechaEnZona, hoy, parseFecha, sumarDias } from "$lib/agenda";
import { consumirFifo } from "./inventario";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import { avisarClienteDeNota, notificar } from "./notificaciones";
import { pageMeta, parsePageParams, skipFor, type PageParams } from "./paginate";
import { tallerMencionado } from "./talleres";
import type { Actor } from "./guard";

/**
 * Quotes, invoices, payments and the credit limit.
 *
 * Money is handled as integer CENTS (`bigint`) everywhere it is added up, and only becomes a
 * `Decimal` string at the database boundary. Totals are always RECOMPUTED from the line items —
 * a total sent by a client is a number nobody checked.
 */

const dec = (cents: bigint) => new Prisma.Decimal(pesos(cents));

/** Exported: `timbrado.ts` reads the same columns and must round them the same way. */
export const aCentavos = (d: Prisma.Decimal | string | null | undefined): bigint =>
	d === null || d === undefined ? 0n : (centavos(d.toString()) ?? 0n);

/**
 * A money column as it goes out over the API.
 *
 * ALWAYS two decimals: `Decimal.toString()` drops trailing zeros, so a total of 5050.00 would
 * serialize as "5050" and an integrator parsing it would silently disagree with the invoice.
 */
export const monto = (d: Prisma.Decimal) => d.toFixed(2);

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
	// The shop's own track, alongside the customer's. Two axes, two columns — see COTIZACION_INTERNOS.
	estadoInterno: c.estadoInterno,
	estadoInternoLabel: cotizacionInternoLabel(c.estadoInterno),
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
		productoId: x.productoId,
		claveProdServ: x.claveProdServ,
		claveUnidad: x.claveUnidad,
		surtido: x.surtido.toFixed(3),
		// A line is fully issued when what left the shelf reaches what was quoted. Derived, never
		// a flag somebody ticks — that is how stock and paperwork stop agreeing.
		surtidoCompleto: Number(x.surtido) >= Number(x.cantidad),
	})),
	createdAt: c.createdAt.toISOString(),
});

export async function getCotizacion(id: string) {
	const cotizacion = await prisma.cotizacion.findUnique({ where: { id }, include: COTIZACION_INCLUDE });
	if (!cotizacion) throw new ClienteError(404, "Cotización no encontrada");
	return cotizacion;
}

export async function listCotizaciones(
	query: {
		notaId?: string | null;
		estado?: string | null;
		estadoInterno?: string | null;
		desde?: string | null;
		hasta?: string | null;
	} & Partial<PageParams>,
) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 25 };
	const where: Prisma.cotizacionWhereInput = {
		...(query.notaId ? { notaId: query.notaId } : {}),
		...(isCotizacionEstado(query.estado) ? { estado: query.estado } : {}),
		...(isCotizacionInterno(query.estadoInterno) ? { estadoInterno: query.estadoInterno } : {}),
		...rangoCreado(query.desde, query.hasta),
	};

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

/**
 * A `createdAt` range from two shop-local calendar days, both inclusive.
 *
 * `hasta` covers the WHOLE day: a filter that ends at midnight silently drops everything quoted
 * that afternoon, which is the day somebody is most likely to be asking about.
 */
export function rangoCreado(desde: string | null | undefined, hasta: string | null | undefined) {
	const d = parseFecha(desde);
	const h = parseFecha(hasta);
	if (!d && !h) return {};
	return {
		createdAt: {
			...(d ? { gte: enZona(d) } : {}),
			// Start of the next day, exclusive — the honest way to say "through the end of `hasta`"
			// without depending on how many milliseconds a timestamp column keeps.
			...(h ? { lt: enZona(sumarDias(h, 1)) } : {}),
		},
	};
}

/**
 * The money picture for a period: what was quoted, what the customer approved, what got invoiced
 * and what has actually been collected.
 *
 * Four different questions the shop asks about the same window, and they are counted from four
 * different places on purpose — a quote being `cobrada` is derived from payments, so counting it
 * as "collected" would be counting the same fact twice through a flag instead of through money.
 */
export async function resumenDinero(desde: string | null, hasta: string | null) {
	const rango = rangoCreado(desde, hasta);

	const [cotizaciones, facturas, pagos] = await Promise.all([
		prisma.cotizacion.findMany({ where: rango, select: { estado: true, total: true } }),
		prisma.factura.findMany({
			where: { ...rango, estado: { not: "cancelada" } },
			select: { total: true, vence: true, estado: true, uuid: true, pagos: { select: { monto: true } } },
		}),
		// Payments are counted by when the MONEY arrived, not by when the invoice was issued: "how
		// much came in this month" is not "how much of what we billed this month came in".
		prisma.pago.findMany({
			where: rangoPagado(desde, hasta),
			select: { monto: true },
		}),
	]);

	const sumar = (xs: { total?: unknown; monto?: unknown }[], campo: "total" | "monto") =>
		xs.reduce((s, x) => s + aCentavos(x[campo] as never), 0n);

	let porCobrar = 0n;
	let vencido = 0n;
	const ahora = new Date();
	for (const f of facturas) {
		const saldo = aCentavos(f.total) - sumar(f.pagos, "monto");
		if (saldo <= 0n) continue;
		porCobrar += saldo;
		if (f.vence && f.vence < ahora) vencido += saldo;
	}

	const autorizadas = cotizaciones.filter((c) => c.estado === "autorizada");

	return {
		cotizado: pesos(sumar(cotizaciones, "total")),
		cotizadas: cotizaciones.length,
		autorizado: pesos(sumar(autorizadas, "total")),
		autorizadas: autorizadas.length,
		facturado: pesos(sumar(facturas, "total")),
		facturas: facturas.length,
		timbradas: facturas.filter((f) => f.uuid !== null).length,
		cobrado: pesos(sumar(pagos, "monto")),
		pagos: pagos.length,
		porCobrar: pesos(porCobrar),
		vencido: pesos(vencido),
	};
}

export const rangoPagado = (desde: string | null | undefined, hasta: string | null | undefined) => {
	const d = parseFecha(desde);
	const h = parseFecha(hasta);
	if (!d && !h) return {};
	return {
		pagadoAt: {
			...(d ? { gte: enZona(d) } : {}),
			...(h ? { lt: enZona(sumarDias(h, 1)) } : {}),
		},
	};
};

/** Line items from the request, validated. Amounts are recomputed, never taken on trust. */
function leerConceptos(value: unknown) {
	if (!Array.isArray(value) || value.length === 0) {
		throw new ClienteError(400, "Agrega al menos un concepto");
	}
	return value.map((raw, i) => {
		const c = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
		if (!isConceptoTipo(c.tipo)) throw new ClienteError(400, `Concepto ${i + 1}: tipo inválido`);

		// A catalogue line may leave the description blank: `resolverProductos` fills it from the
		// product's own name. Making somebody retype what the catalogue already knows is how a
		// quote ends up describing a part differently from the thing that leaves the shelf.
		const productoId = trim(c.productoId);
		const descripcion = trim(c.descripcion, 500, `La descripción del concepto ${i + 1}`);
		if (!descripcion && !productoId) throw new ClienteError(400, `Concepto ${i + 1}: falta la descripción`);

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
			// "" only survives when a productoId came with it, and `resolverProductos` replaces it
			// with the product's name before anything is written.
			descripcion: descripcion ?? "",
			cantidad,
			precioUnitario,
			importe: importeConcepto(cantidad, precioUnitario),
			orden: i,
			// Optional: a one-off line ("mandar rectificar la cabeza con el del torno") is a real
			// quote line that will never be a catalogue product.
			productoId,
		};
	});
}

/**
 * Fill in each line from the catalogue: SAT keys, and the price when the caller did not set one.
 *
 * The keys are **copied onto the line**, never read through the relation at display time.
 * Re-classifying a product next year must not silently rewrite what was already quoted — the same
 * reasoning as copying credit terms onto an invoice at issue.
 */
async function resolverProductos(conceptos: ReturnType<typeof leerConceptos>) {
	const ids = [...new Set(conceptos.map((c) => c.productoId).filter((id): id is string => Boolean(id)))];
	if (ids.length === 0) return conceptos.map((c) => ({ ...c, claveProdServ: null, claveUnidad: null }));

	const productos = await prisma.producto.findMany({
		where: { id: { in: ids } },
		select: { id: true, nombre: true, claveProdServ: true, claveUnidad: true, precioVenta: true, archivedAt: true },
	});
	const porId = new Map(productos.map((p) => [p.id, p]));

	return conceptos.map((c) => {
		if (!c.productoId) return { ...c, claveProdServ: null, claveUnidad: null };
		const p = porId.get(c.productoId);
		if (!p) throw new ClienteError(404, `El producto de "${c.descripcion}" ya no existe`);
		if (p.archivedAt) throw new ClienteError(409, `${p.nombre} está archivado y no se puede cotizar.`);

		return {
			...c,
			// Blank means "call it whatever the catalogue calls it" — see `leerConceptos`.
			descripcion: c.descripcion || p.nombre,
			claveProdServ: p.claveProdServ,
			claveUnidad: p.claveUnidad,
			// A zero price on a catalogue line is almost always "the form did not send one", not a
			// giveaway. Fall back to the list price rather than quoting free work.
			precioUnitario: c.precioUnitario === 0n ? (centavos(p.precioVenta.toFixed(2)) ?? 0n) : c.precioUnitario,
		};
	});
}

/**
 * A quote line is CUSTOMER-FACING data: they read the concepts on `/seguimiento`, and they read
 * them on the invoice. So the same rule a visible comment follows applies here — the partner
 * workshop never surfaces. Catches the honest slip ("mandar con El Sahuaro") written into a line.
 *
 * Checked on the way IN rather than filtered on the way out: redacting a money document after the
 * fact would silently change what somebody was quoted.
 */
async function exigirSinTaller(conceptos: { descripcion: string }[]) {
	for (const c of conceptos) {
		const mencionado = await tallerMencionado(c.descripcion);
		if (mencionado) {
			throw new ClienteError(
				400,
				`El concepto "${c.descripcion}" menciona a "${mencionado}". El cliente lee la cotización, y los talleres aliados nunca se le comparten: descríbelo por el trabajo, no por quién lo hace.`,
			);
		}
	}
}

/** Recompute importe after `resolverProductos` may have substituted a price. */
const conImportes = <T extends { cantidad: number; precioUnitario: bigint }>(conceptos: T[]) =>
	conceptos.map((c) => ({ ...c, importe: importeConcepto(c.cantidad, c.precioUnitario) }));

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

	const conceptos = conImportes(await resolverProductos(leerConceptos(input.body.conceptos)));
	await exigirSinTaller(conceptos);
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
						productoId: c.productoId,
						// Copied, never read through the relation: re-classifying the product later
						// must not rewrite what was already quoted.
						claveProdServ: c.claveProdServ,
						claveUnidad: c.claveUnidad,
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
export async function actualizarCotizacion(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
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

	const conceptos = conImportes(await resolverProductos(leerConceptos(input.body.conceptos)));
	await exigirSinTaller(conceptos);
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
						productoId: c.productoId,
						// Copied, never read through the relation: re-classifying the product later
						// must not rewrite what was already quoted.
						claveProdServ: c.claveProdServ,
						claveUnidad: c.claveUnidad,
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

/**
 * Resend the "cotización lista" email. `cambiarEstadoCotizacion` only fires it on the ONE
 * borrador→enviada transition — a quote already `enviada` (or later) can never transition back
 * to `enviada`, so "el cliente dice que no le llegó" has no other way back in. Same permission as
 * sending it the first time; no state change, no new audit action beyond the resend itself.
 */
export async function reenviarCotizacionCorreo(input: { actor: Actor; id: string }) {
	if (!can(input.actor.role, "cotizacion:send")) throw new ClienteError(403, "Sin permiso: cotizacion:send");

	const current = await getCotizacion(input.id);
	if (current.estado === "borrador") {
		throw new ClienteError(409, "Esta cotización todavía no se ha enviado.");
	}

	await avisarClienteDeNota(current.notaId, {
		evento: "cliente_cotizacion",
		titulo: "Tu cotización está lista",
		cuerpo: `Cotización #${current.folio} por $${monto(current.total)}. Ábrela para autorizarla o rechazarla.`,
	});

	await recordAudit(prisma, {
		action: "cotizacion.reenviar",
		actor: input.actor,
		entityId: current.id,
		entityLabel: `Cotización #${current.folio}`,
		summary: `Cotización #${current.folio}: correo reenviado`,
	});

	return current;
}

// --- Cotización interna (estimación de costo) -----------------------------------------------
//
// A cost estimate for a job, almost always relayed from a mechanic via WhatsApp — typed in by
// Admin/Gerente, never by the mechanic (`taller` holds none of these three permissions). Modeled
// on `solicitarRefaccion`/`resolverSolicitud` in `./inventario`: a simple pendiente → aprobada/
// rechazada object, not a third axis bolted onto `cotizacion`.

const COTIZACION_INTERNA_INCLUDE = {
	conceptos: { orderBy: { orden: "asc" } },
	nota: { select: { folio: true } },
	mecanico: { select: { id: true, name: true } },
	cotizacion: { select: { id: true, folio: true } },
	creadaPor: { select: { name: true } },
	resueltaPor: { select: { name: true } },
} satisfies Prisma.cotizacion_internaInclude;

type CotizacionInternaRow = Prisma.cotizacion_internaGetPayload<{ include: typeof COTIZACION_INTERNA_INCLUDE }>;

export const publicCotizacionInterna = (c: CotizacionInternaRow) => ({
	id: c.id,
	folio: c.folio,
	notaId: c.notaId,
	notaFolio: c.nota?.folio ?? null,
	mecanicoId: c.mecanicoId,
	mecanicoNombre: c.mecanico?.name ?? null,
	cotizacionId: c.cotizacionId,
	cotizacionFolio: c.cotizacion?.folio ?? null,
	estado: c.estado,
	estadoLabel: cotizacionInternaEstadoLabel(c.estado),
	resolucionMotivo: c.resolucionMotivo,
	total: monto(c.total),
	creadaPor: c.creadaPor?.name ?? null,
	resueltaPor: c.resueltaPor?.name ?? null,
	resueltaAt: c.resueltaAt?.toISOString() ?? null,
	conceptos: c.conceptos.map((x) => ({
		id: x.id,
		descripcion: x.descripcion,
		cantidad: x.cantidad.toFixed(2),
		costoUnitario: monto(x.costoUnitario),
		importe: monto(x.importe),
		productoId: x.productoId,
	})),
	createdAt: c.createdAt.toISOString(),
});

export async function getCotizacionInterna(actor: Actor, id: string) {
	if (!can(actor.role, "cotizacion_interna:read")) {
		throw new ClienteError(403, "Sin permiso: cotizacion_interna:read");
	}
	const fila = await prisma.cotizacion_interna.findUnique({ where: { id }, include: COTIZACION_INTERNA_INCLUDE });
	if (!fila) throw new ClienteError(404, "Estimación de costo no encontrada");
	return fila;
}

export async function listCotizacionesInternas(
	actor: Actor,
	query: { notaId?: string | null; estado?: string | null; mecanicoId?: string | null },
) {
	if (!can(actor.role, "cotizacion_interna:read")) {
		throw new ClienteError(403, "Sin permiso: cotizacion_interna:read");
	}
	const where: Prisma.cotizacion_internaWhereInput = {
		...(query.notaId ? { notaId: query.notaId } : {}),
		...(isCotizacionInternaEstado(query.estado) ? { estado: query.estado } : {}),
		...(query.mecanicoId ? { mecanicoId: query.mecanicoId } : {}),
	};
	const filas = await prisma.cotizacion_interna.findMany({
		where,
		orderBy: { createdAt: "desc" },
		include: COTIZACION_INTERNA_INCLUDE,
	});
	return filas.map(publicCotizacionInterna);
}

/** Line items from the request. No `tipo`, no SAT keys — this never reaches a CFDI. */
function leerConceptosCosto(value: unknown) {
	if (!Array.isArray(value) || value.length === 0) {
		throw new ClienteError(400, "Agrega al menos un concepto");
	}
	return value.map((raw, i) => {
		const c = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

		const productoId = trim(c.productoId);
		const descripcion = trim(c.descripcion, 500, `La descripción del concepto ${i + 1}`);
		if (!descripcion && !productoId) throw new ClienteError(400, `Concepto ${i + 1}: falta la descripción`);

		const cantidad = Number(c.cantidad);
		if (!Number.isFinite(cantidad) || cantidad <= 0) {
			throw new ClienteError(400, `Concepto ${i + 1}: la cantidad debe ser mayor que cero`);
		}
		const costoUnitario = centavos(c.costoUnitario);
		if (costoUnitario === null) {
			throw new ClienteError(400, `Concepto ${i + 1}: costo inválido (usa 1234.50)`);
		}

		return {
			descripcion: descripcion ?? "",
			cantidad,
			costoUnitario,
			importe: importeConcepto(cantidad, costoUnitario),
			orden: i,
			productoId,
		};
	});
}

/** Validate any catalogue links; fill a blank descripción from the product's own name. */
async function resolverProductosCosto(conceptos: ReturnType<typeof leerConceptosCosto>) {
	const ids = [...new Set(conceptos.map((c) => c.productoId).filter((id): id is string => Boolean(id)))];
	if (ids.length === 0) return conceptos;

	const productos = await prisma.producto.findMany({
		where: { id: { in: ids } },
		select: { id: true, nombre: true, archivedAt: true },
	});
	const porId = new Map(productos.map((p) => [p.id, p]));

	return conceptos.map((c) => {
		if (!c.productoId) return c;
		const p = porId.get(c.productoId);
		if (!p) throw new ClienteError(404, `El producto de "${c.descripcion}" ya no existe`);
		if (p.archivedAt) throw new ClienteError(409, `${p.nombre} está archivado.`);
		return { ...c, descripcion: c.descripcion || p.nombre };
	});
}

async function validarMecanico(mecanicoId: string | null) {
	if (!mecanicoId) return null;
	const user = await prisma.user.findUnique({ where: { id: mecanicoId }, select: { id: true, role: true } });
	if (!user || user.role !== "taller") throw new ClienteError(400, "Ese usuario no es un mecánico.");
	return user.id;
}

async function cargarNotaParaCosto(notaId: string) {
	const nota = await prisma.nota_servicio.findUnique({
		where: { id: notaId },
		select: { id: true, folio: true, estado: true },
	});
	if (!nota) throw new ClienteError(404, "Nota de servicio no encontrada");
	if (nota.estado === "cancelada" || nota.estado === "entregada") {
		throw new ClienteError(409, "Esa nota ya está cerrada.");
	}
	return nota;
}

export async function crearCotizacionInterna(input: { actor: Actor; notaId: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cotizacion_interna:create")) {
		throw new ClienteError(403, "Sin permiso: cotizacion_interna:create");
	}

	const nota = await cargarNotaParaCosto(input.notaId);
	const mecanicoId = await validarMecanico(trim(input.body.mecanicoId));
	const cotizacionId = trim(input.body.cotizacionId);
	if (cotizacionId) await exigirCotizacionDeLaNota(cotizacionId, nota.id);

	const conceptos = await resolverProductosCosto(leerConceptosCosto(input.body.conceptos));
	const total = conceptos.reduce((s, c) => s + c.importe, 0n);

	const creada = await prisma.$transaction(async (tx) => {
		const fila = await tx.cotizacion_interna.create({
			data: {
				id: randomUUID(),
				notaId: nota.id,
				mecanicoId,
				cotizacionId: cotizacionId || null,
				total: dec(total),
				creadaPorId: input.actor.id,
				conceptos: {
					create: conceptos.map((c) => ({
						id: randomUUID(),
						descripcion: c.descripcion,
						cantidad: new Prisma.Decimal(c.cantidad),
						costoUnitario: dec(c.costoUnitario),
						importe: dec(c.importe),
						orden: c.orden,
						productoId: c.productoId,
					})),
				},
			},
			include: COTIZACION_INTERNA_INCLUDE,
		});

		await recordAudit(tx, {
			action: "cotizacion_interna.create",
			actor: input.actor,
			entityId: fila.id,
			entityLabel: `Estimación #${fila.folio} (nota #${nota.folio})`,
			summary: `Estimación de costo #${fila.folio} por ${pesos(total)} en la nota #${nota.folio}`,
			after: { total: pesos(total), conceptos: conceptos.length, mecanicoId },
		});

		return fila;
	});

	await notificar({
		evento: "cotizacion_interna_creada",
		destino: { difusion: true },
		titulo: "Estimación de costo pendiente",
		cuerpo: `Nota #${nota.folio}: ${pesos(total)} por revisar`,
		url: `/panel/notas/${nota.id}`,
		entidad: "nota",
		entidadId: nota.id,
		excepto: input.actor.id,
	});

	return publicCotizacionInterna(creada);
}

/** Only `pendiente` is editable — once resolved, submit a new estimate instead. */
export async function actualizarCotizacionInterna(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cotizacion_interna:create")) {
		throw new ClienteError(403, "Sin permiso: cotizacion_interna:create");
	}

	const current = await getCotizacionInterna(input.actor, input.id);
	if (current.estado !== "pendiente") {
		throw new ClienteError(409, "Esta estimación ya se resolvió. Crea una nueva.");
	}

	const mecanicoId = "mecanicoId" in input.body ? await validarMecanico(trim(input.body.mecanicoId)) : current.mecanicoId;
	const conceptos = await resolverProductosCosto(leerConceptosCosto(input.body.conceptos));
	const total = conceptos.reduce((s, c) => s + c.importe, 0n);

	const actualizada = await prisma.$transaction(async (tx) => {
		await tx.cotizacion_interna_concepto.deleteMany({ where: { cotizacionInternaId: current.id } });
		const fila = await tx.cotizacion_interna.update({
			where: { id: current.id },
			data: {
				mecanicoId,
				total: dec(total),
				conceptos: {
					create: conceptos.map((c) => ({
						id: randomUUID(),
						descripcion: c.descripcion,
						cantidad: new Prisma.Decimal(c.cantidad),
						costoUnitario: dec(c.costoUnitario),
						importe: dec(c.importe),
						orden: c.orden,
						productoId: c.productoId,
					})),
				},
			},
			include: COTIZACION_INTERNA_INCLUDE,
		});

		await recordAudit(tx, {
			action: "cotizacion_interna.update",
			actor: input.actor,
			entityId: fila.id,
			entityLabel: `Estimación #${fila.folio}`,
			summary: `Estimación de costo #${fila.folio} actualizada: ${pesos(total)}`,
			before: { total: monto(current.total) },
			after: { total: pesos(total) },
		});

		return fila;
	});

	return publicCotizacionInterna(actualizada);
}

async function exigirCotizacionDeLaNota(cotizacionId: string, notaId: string) {
	const cot = await prisma.cotizacion.findUnique({ where: { id: cotizacionId }, select: { notaId: true, folio: true } });
	if (!cot) throw new ClienteError(404, "Cotización no encontrada");
	if (cot.notaId !== notaId) throw new ClienteError(400, "Esa cotización no es de esta nota.");
}

/** Link (or unlink, with `cotizacionId: null`) an estimate to a customer-facing cotización. */
export async function vincularCotizacionInterna(input: { actor: Actor; id: string; cotizacionId: string | null }) {
	if (!can(input.actor.role, "cotizacion_interna:create")) {
		throw new ClienteError(403, "Sin permiso: cotizacion_interna:create");
	}

	const current = await getCotizacionInterna(input.actor, input.id);
	if (input.cotizacionId) await exigirCotizacionDeLaNota(input.cotizacionId, current.notaId);

	const actualizada = await prisma.$transaction(async (tx) => {
		const fila = await tx.cotizacion_interna.update({
			where: { id: current.id },
			data: { cotizacionId: input.cotizacionId },
			include: COTIZACION_INTERNA_INCLUDE,
		});
		await recordAudit(tx, {
			action: "cotizacion_interna.vincular",
			actor: input.actor,
			entityId: fila.id,
			entityLabel: `Estimación #${fila.folio}`,
			summary: input.cotizacionId
				? `Estimación #${fila.folio} ligada a la cotización #${fila.cotizacion?.folio}`
				: `Estimación #${fila.folio} desligada de su cotización`,
			before: { cotizacionId: current.cotizacionId },
			after: { cotizacionId: input.cotizacionId },
		});
		return fila;
	});

	return publicCotizacionInterna(actualizada);
}

/** Approve or reject. Terminal both ways — a new estimate is submitted instead of reopening one. */
export async function resolverCotizacionInterna(input: {
	actor: Actor;
	id: string;
	estado: unknown;
	motivo?: unknown;
}) {
	if (!can(input.actor.role, "cotizacion_interna:authorize")) {
		throw new ClienteError(403, "Sin permiso: cotizacion_interna:authorize");
	}

	const destino = input.estado;
	if (!isCotizacionInternaEstado(destino) || destino === "pendiente") {
		throw new ClienteError(400, "Decide si se aprueba o se rechaza.");
	}
	const current = await getCotizacionInterna(input.actor, input.id);
	if (!puedeTransicionarCotizacionInterna(current.estado, destino)) {
		throw new ClienteError(409, "Esa estimación ya se resolvió.");
	}

	const motivo = trim(input.motivo, 500, "El motivo");
	if (destino === "rechazada" && !motivo) {
		throw new ClienteError(400, "Di por qué se rechaza; es lo que queda en el registro.");
	}

	const resuelta = await prisma.$transaction(async (tx) => {
		const fila = await tx.cotizacion_interna.update({
			where: { id: current.id },
			data: {
				estado: destino,
				resolucionMotivo: motivo,
				resueltaPorId: input.actor.id,
				resueltaAt: new Date(),
			},
			include: COTIZACION_INTERNA_INCLUDE,
		});

		await recordAudit(tx, {
			action: destino === "aprobada" ? "cotizacion_interna.aprobada" : "cotizacion_interna.rechazada",
			actor: input.actor,
			entityId: fila.id,
			entityLabel: `Estimación #${fila.folio}`,
			summary: `Estimación de costo #${fila.folio}: ${cotizacionInternaEstadoLabel(destino)}`,
			before: { estado: "pendiente" },
			after: { estado: destino, motivo },
		});

		return fila;
	});

	if (resuelta.creadaPorId) {
		await notificar({
			evento: "cotizacion_interna_resuelta",
			destino: { userId: resuelta.creadaPorId },
			titulo: destino === "aprobada" ? "Estimación aprobada" : "Estimación rechazada",
			cuerpo: `Nota #${resuelta.nota?.folio}: ${pesos(aCentavos(resuelta.total))}${motivo ? ` — ${motivo}` : ""}`,
			url: `/panel/notas/${resuelta.notaId}`,
			entidad: "nota",
			entidadId: resuelta.notaId,
			excepto: input.actor.id,
		});
	}

	// The mechanic whose number this was gets told too — approval only, per how the shop works:
	// a rejection is a conversation with whoever typed it in, not a verdict on the mechanic. No
	// peso amount here — a mechanic never sees cost figures (`producto:read` is not theirs either),
	// so the message confirms the decision without leaking what the job costs.
	if (destino === "aprobada" && resuelta.mecanicoId && resuelta.mecanicoId !== resuelta.creadaPorId) {
		await notificar({
			evento: "cotizacion_interna_resuelta",
			destino: { userId: resuelta.mecanicoId },
			titulo: "Tu estimación fue aprobada",
			cuerpo: `Nota #${resuelta.nota?.folio}: tu estimación de costo fue aprobada.`,
			url: `/panel/taller/${resuelta.notaId}`,
			entidad: "nota",
			entidadId: resuelta.notaId,
			excepto: input.actor.id,
		});
	}

	return publicCotizacionInterna(resuelta);
}

/** Past descriptions this mechanic has had approved or submitted, most recent first. */
export async function sugerirDescripcionesCosto(input: { actor: Actor; mecanicoId: string }) {
	if (!can(input.actor.role, "cotizacion_interna:create")) {
		throw new ClienteError(403, "Sin permiso: cotizacion_interna:create");
	}
	const filas = await prisma.cotizacion_interna_concepto.findMany({
		where: { cotizacionInterna: { mecanicoId: input.mecanicoId } },
		select: { descripcion: true },
		orderBy: { cotizacionInterna: { createdAt: "desc" } },
		take: 100,
	});
	const vistas = new Set<string>();
	const sugerencias: string[] = [];
	for (const f of filas) {
		if (vistas.has(f.descripcion)) continue;
		vistas.add(f.descripcion);
		sugerencias.push(f.descripcion);
		if (sugerencias.length >= 20) break;
	}
	return sugerencias;
}

/** venta - costo aprobado. Returns null (never a wrong number) when the actor can't see margin. */
export type MargenCotizacion = {
	venta: string;
	costo: string;
	utilidad: string;
	/** Margin, not markup — `((venta - costo) / venta) × 100`. Null when venta is 0. */
	margen: number | null;
};

export async function utilidadDeCotizacion(actor: Actor, cotizacionId: string): Promise<MargenCotizacion | null> {
	if (!can(actor.role, "cotizacion:costo")) return null;
	const cotizacion = await prisma.cotizacion.findUnique({ where: { id: cotizacionId }, select: { total: true } });
	if (!cotizacion) return null;
	const internas = await prisma.cotizacion_interna.findMany({
		where: { cotizacionId, estado: "aprobada" },
		select: { estado: true, total: true },
	});
	const venta = aCentavos(cotizacion.total);
	const costo = internas.reduce((s, i) => s + aCentavos(i.total), 0n);
	const utilidad = utilidadCotizacion(
		venta,
		internas.map((i) => ({ estado: i.estado, total: aCentavos(i.total) })),
	);
	return { venta: pesos(venta), costo: pesos(costo), utilidad: pesos(utilidad), margen: margenPorcentaje(venta, costo) };
}

// --- Crédito ---------------------------------------------------------------------------------

/** What a set of invoices billed, and what has been paid against them, in cents. */
function sumarFacturasYPagos(facturas: { total: Prisma.Decimal; pagos: { monto: Prisma.Decimal }[] }[]) {
	let facturado = 0n;
	let pagado = 0n;
	for (const f of facturas) {
		facturado += aCentavos(f.total);
		for (const p of f.pagos) pagado += aCentavos(p.monto);
	}
	return { facturado, pagado };
}

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

	const { facturado, pagado } = sumarFacturasYPagos(facturas);

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
 * What a customer is worth, for their profile screen: what they've actually paid across EVERY
 * invoice ever issued to them — cash or credit — not just the credit balance `saldoCliente`
 * tracks. Cancelled and draft invoices are excluded on both sides; they were never real revenue.
 *
 * `abiertas` is every `emitida` invoice: paying one off in full transitions it to `pagada`
 * (`registrarPago`), so `emitida` already means "still owes something," partial or whole.
 */
export async function resumenClienteFinanciero(clienteId: string) {
	const [facturas, abiertas, ultimosPagos] = await Promise.all([
		prisma.factura.findMany({
			where: { clienteId, estado: { in: ["emitida", "pagada"] } },
			select: { total: true, pagos: { select: { monto: true } } },
		}),
		listFacturas({ clienteId, estado: "emitida", perPage: 10 }),
		prisma.pago.findMany({
			where: { factura: { clienteId } },
			orderBy: { pagadoAt: "desc" },
			take: 5,
			include: { factura: { select: { folio: true } } },
		}),
	]);

	const { facturado, pagado } = sumarFacturasYPagos(facturas);

	return {
		totalFacturado: pesos(facturado),
		totalPagado: pesos(pagado),
		pendiente: pesos(facturado - pagado),
		facturasAbiertas: abiertas.facturas,
		// `abiertas.facturas` is capped at 10 for the summary list — this is the real count, for
		// the heading, so a customer with more open invoices than fit on the card is not undercounted.
		totalFacturasAbiertas: abiertas.total,
		ultimosPagos: ultimosPagos.map((p) => ({
			id: p.id,
			facturaFolio: p.factura.folio,
			monto: monto(p.monto),
			metodoLabel: metodoPagoLabel(p.metodo),
			pagadoAt: p.pagadoAt.toISOString(),
		})),
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
		throw new ClienteError(409, "Este cliente no tiene crédito autorizado. Cobra de contado o asígnale un límite.");
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
export async function actualizarCredito(input: { actor: Actor; clienteId: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cliente:credito")) {
		throw new ClienteError(403, "Sin permiso: cliente:credito");
	}

	const cliente = await prisma.cliente.findUnique({
		where: { id: input.clienteId },
		select: { id: true, nombreCompleto: true, limiteCredito: true, diasCredito: true },
	});
	if (!cliente) throw new ClienteError(404, "Cliente no encontrado");

	const sinCredito =
		input.body.limiteCredito === "" || input.body.limiteCredito === null || input.body.limiteCredito === undefined;

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
	// The invoice IS its lines: every screen that shows one wants them, and stamping cannot work
	// without them.
	conceptos: { orderBy: { orden: "asc" } },
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
		// Signed, shop-local days: negative once it's overdue, 0 the day it's due. The one place
		// "vence en 3 días" vs. "vencida hace 3 días" is computed — every screen reads this, none
		// re-derives it from `vence` on its own.
		diasParaVencer: f.vence ? diasEntre(hoy(), fechaEnZona(f.vence)) : null,
		subtotal: monto(f.subtotal),
		iva: monto(f.iva),
		total: monto(f.total),
		pagado: pesos(pagado),
		saldo: pesos(total - pagado),
		liquidada: pagado >= total,
		conceptos: f.conceptos.map((x) => ({
			id: x.id,
			tipo: x.tipo,
			tipoLabel: conceptoTipoLabel(x.tipo),
			descripcion: x.descripcion,
			cantidad: x.cantidad.toFixed(2),
			precioUnitario: monto(x.precioUnitario),
			importe: monto(x.importe),
			productoId: x.productoId,
			claveProdServ: x.claveProdServ,
			claveUnidad: x.claveUnidad,
		})),
		uuid: f.uuid,
		serie: f.serie,
		// Stamping. `timbrada` is what the screens gate on — an invoice can be `emitida` (the shop
		// issued it) without ever having been stamped, and those are different facts.
		timbrada: f.uuid !== null,
		timbradaAt: f.timbradaAt?.toISOString() ?? null,
		// Which environment produced it, so a sandbox document is never mistaken for a fiscal one.
		// `pacUid` is deliberately NOT exposed: it is the provider's internal handle, it identifies
		// our account's document to anyone holding it, and no client needs it — the routes that use
		// it read it from the row.
		entorno: f.pacEntorno,
		emitidaAt: f.emitidaAt?.toISOString() ?? null,
		canceladaAt: f.canceladaAt?.toISOString() ?? null,
		canceladoMotivo: f.canceladoMotivo,
		cancelacionEstatus: f.cancelacionEstatus,
		cancelacionMotivo: f.cancelacionMotivo,
		cancelacionSustituye: f.cancelacionSustituye,
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
	query: {
		clienteId?: string | null;
		notaId?: string | null;
		estado?: string | null;
		vencidas?: boolean;
		desde?: string | null;
		hasta?: string | null;
	} & Partial<PageParams>,
) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 25 };
	const where: Prisma.facturaWhereInput = {
		...(query.clienteId ? { clienteId: query.clienteId } : {}),
		...(query.notaId ? { notaId: query.notaId } : {}),
		...(query.estado ? { estado: query.estado } : {}),
		...(query.vencidas ? { estado: "emitida", vence: { lt: new Date() } } : {}),
		...rangoCreado(query.desde, query.hasta),
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

	/**
	 * The invoice's OWN lines, whichever path it came from.
	 *
	 * Copied, never read back through the quote: re-quoting or re-classifying a product next year
	 * must not rewrite what was already invoiced — the same reasoning as copying the credit terms.
	 * It is also what makes an ad-hoc invoice stampable at all, because a CFDI needs the detail and
	 * before this the lines were computed, used for a total, and thrown away.
	 */
	let lineas: {
		tipo: string;
		descripcion: string;
		cantidad: number;
		precioUnitario: bigint;
		importe: bigint;
		orden: number;
		productoId: string | null;
		claveProdServ: string | null;
		claveUnidad: string | null;
	}[] = [];

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
		lineas = cotizacion.conceptos.map((c, i) => ({
			tipo: c.tipo,
			descripcion: c.descripcion,
			cantidad: Number(c.cantidad.toString()),
			precioUnitario: aCentavos(c.precioUnitario),
			importe: aCentavos(c.importe),
			orden: c.orden ?? i,
			productoId: c.productoId,
			claveProdServ: c.claveProdServ,
			claveUnidad: c.claveUnidad,
		}));
	} else {
		lineas = await resolverProductos(leerConceptos(input.body.conceptos));
		({ subtotal, iva, total } = totales(lineas));
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
				// Written in the SAME transaction as the invoice: an invoice whose lines committed
				// separately could exist without them, and that invoice is one nobody can stamp.
				conceptos: {
					create: lineas.map((l) => ({
						id: randomUUID(),
						tipo: l.tipo,
						descripcion: l.descripcion,
						cantidad: new Prisma.Decimal(l.cantidad),
						precioUnitario: dec(l.precioUnitario),
						importe: dec(l.importe),
						orden: l.orden,
						productoId: l.productoId,
						claveProdServ: l.claveProdServ,
						claveUnidad: l.claveUnidad,
					})),
				},
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
	// A stamped invoice exists at the SAT whatever this row says. Flipping the estado here would
	// leave a live CFDI the shop believes is gone — and would let it be re-invoiced. Cancelling a
	// stamped invoice goes through `cancelarEnSat`, which asks the SAT first.
	if (current.uuid) {
		throw new ClienteError(
			409,
			"Esa factura ya está timbrada: hay que cancelarla ante el SAT, con su motivo (01–04).",
		);
	}
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

	// `cobrada` is arithmetic, not a button — recompute it wherever the arithmetic changes.
	await sincronizarCobranza(factura.cotizacionId);

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

// --- La pista interna: trabajo y cobro ---------------------------------------------------------

/**
 * How much of this quote has actually been collected.
 *
 * Reads the payments on its linked invoices — the same numbers `factura.pagada` turns on, so the
 * two can never disagree. This is what makes `cobrada` arithmetic instead of a button.
 */
async function cobranzaDe(cotizacionId: string) {
	const facturas = await prisma.factura.findMany({
		where: { cotizacionId, estado: { not: "cancelada" } },
		select: { total: true, pagos: { select: { monto: true } } },
	});

	const facturado = facturas.reduce((s, f) => s + aCentavos(f.total), 0n);
	const pagado = facturas.reduce((s, f) => s + f.pagos.reduce((t, p) => t + aCentavos(p.monto), 0n), 0n);
	return { facturas: facturas.length, facturado, pagado, saldo: facturado - pagado };
}

/**
 * Move a quote along the SHOP's track.
 *
 * `cobrada` is deliberately NOT reachable here — it is derived from the payments, and
 * `sincronizarCobranza` sets it. Offering it as a destination would be a button that lies about
 * money, the same reason `factura.pagada` has none.
 *
 * The database also refuses any internal state past `pendiente` while the customer has not
 * authorized (`cotizacion_interno_requiere_autorizacion_check`), so a race between "the customer
 * said yes" and "we started" cannot leave an impossible row behind.
 */
export async function avanzarInterno(input: { actor: Actor; id: string; estado: unknown }) {
	if (!can(input.actor.role, "cotizacion:interno")) {
		throw new ClienteError(403, "Sin permiso: cotizacion:interno");
	}

	const destino = input.estado;
	if (!isCotizacionInterno(destino)) throw new ClienteError(400, "Estado interno inválido");
	if (destino === "cobrada") {
		throw new ClienteError(
			400,
			"«Cobrada» se alcanza registrando los pagos, no a mano. Registra el pago en la factura.",
		);
	}

	const current = await getCotizacion(input.id);
	if (current.estado !== "autorizada") {
		throw new ClienteError(
			409,
			"El cliente todavía no autoriza esta cotización. No se puede empezar a trabajarla ni cobrarla.",
		);
	}
	if (!puedeTransicionarInterno(current.estadoInterno, destino)) {
		throw new ClienteError(
			409,
			`No se puede pasar de ${cotizacionInternoLabel(current.estadoInterno)} a ${cotizacionInternoLabel(destino)}.`,
		);
	}

	// "Por cobrar" means there is something to collect. Without an invoice there is nothing.
	if (destino === "por_cobrar") {
		const { facturas } = await cobranzaDe(current.id);
		if (facturas === 0) {
			throw new ClienteError(
				409,
				"Emite la factura antes de marcarla por cobrar: no hay nada que cobrar todavía.",
			);
		}
	}

	const cotizacion = await prisma.$transaction(async (tx) => {
		const actualizada = await tx.cotizacion.update({
			where: { id: current.id },
			data: { estadoInterno: destino },
			include: COTIZACION_INCLUDE,
		});

		await recordAudit(tx, {
			action: "cotizacion.interno",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: `Cotización #${actualizada.folio}`,
			summary: `Cotización #${actualizada.folio}: ${cotizacionInternoLabel(current.estadoInterno)} → ${cotizacionInternoLabel(destino)}`,
			before: { estadoInterno: current.estadoInterno },
			after: { estadoInterno: destino },
		});

		return actualizada;
	});

	return publicCotizacion(cotizacion);
}

/**
 * Recompute `cobrada` from the payments. Called after every payment and every invoice issue.
 *
 * Runs both ways: a quote that is fully paid becomes `cobrada`, and one that stops being fully
 * paid (an invoice cancelled, a payment reversed) drops back to `por_cobrar`. A one-way flag would
 * leave the shop's own board claiming money it no longer has.
 *
 * Never throws into the payment path — a status label is not worth failing a transaction that took
 * somebody's money.
 */
export async function sincronizarCobranza(cotizacionId: string | null | undefined): Promise<void> {
	if (!cotizacionId) return;
	try {
		const cotizacion = await prisma.cotizacion.findUnique({
			where: { id: cotizacionId },
			select: { id: true, folio: true, estadoInterno: true, estado: true },
		});
		if (!cotizacion || cotizacion.estado !== "autorizada") return;

		const { facturas, facturado, saldo } = await cobranzaDe(cotizacion.id);
		if (facturas === 0 || facturado === 0n) return;

		const liquidada = saldo <= 0n;
		if (liquidada && cotizacion.estadoInterno !== "cobrada") {
			await prisma.cotizacion.update({ where: { id: cotizacion.id }, data: { estadoInterno: "cobrada" } });
		} else if (!liquidada && cotizacion.estadoInterno === "cobrada") {
			await prisma.cotizacion.update({ where: { id: cotizacion.id }, data: { estadoInterno: "por_cobrar" } });
		}
	} catch (err) {
		console.error("sincronizarCobranza falló:", err);
	}
}

/**
 * Issue the parts a quote calls for, FIFO, and record how much of each line has been supplied.
 *
 * Only catalogue lines that carry stock are touched — labour and sublet work have nothing to
 * issue. Lines already fully supplied are skipped, so calling this twice does not double-consume:
 * the guard is `cantidad - surtido`, computed from the row, not from what the caller asks for.
 *
 * All or nothing. If one part is short the whole thing rolls back, because half a job's parts
 * leaving the shelf without anybody being told is worse than a clear refusal.
 */
export async function surtirCotizacion(input: { actor: Actor; id: string }) {
	if (!can(input.actor.role, "inventario:salida")) {
		throw new ClienteError(403, "Sin permiso: inventario:salida");
	}

	const current = await getCotizacion(input.id);
	if (current.estado !== "autorizada") {
		throw new ClienteError(409, "Surte hasta que el cliente autorice la cotización.");
	}

	const conProducto = current.conceptos.filter((c) => c.productoId);
	if (conProducto.length === 0) {
		throw new ClienteError(409, "Esta cotización no tiene renglones del catálogo que surtir.");
	}

	const productos = await prisma.producto.findMany({
		where: { id: { in: conProducto.map((c) => c.productoId!) } },
		select: { id: true, nombre: true, controlaInventario: true },
	});
	const porId = new Map(productos.map((p) => [p.id, p]));

	const pendientes = conProducto
		.filter((c) => porId.get(c.productoId!)?.controlaInventario)
		.map((c) => ({ concepto: c, falta: Number(c.cantidad) - Number(c.surtido) }))
		.filter((x) => x.falta > 0.0005);

	if (pendientes.length === 0) throw new ClienteError(409, "Ya está todo surtido.");

	const resultado = await prisma.$transaction(async (tx) => {
		let costo = 0;
		for (const { concepto, falta } of pendientes) {
			const { costoTotal } = await consumirFifo(tx, {
				actor: input.actor,
				productoId: concepto.productoId!,
				cantidad: falta,
				notaId: current.notaId,
				conceptoId: concepto.id,
				motivo: `Cotización #${current.folio}`,
			});
			costo += costoTotal;

			await tx.cotizacion_concepto.update({
				where: { id: concepto.id },
				data: { surtido: new Prisma.Decimal(Number(concepto.cantidad).toFixed(3)) },
			});
		}

		await recordAudit(tx, {
			action: "cotizacion.concepto",
			actor: input.actor,
			entityId: current.id,
			entityLabel: `Cotización #${current.folio}`,
			summary: `Surtidos ${pendientes.length} renglón(es) de la cotización #${current.folio}`,
			after: { renglones: pendientes.length, costo: costo.toFixed(2) },
		});

		return { renglones: pendientes.length, costo: costo.toFixed(2) };
	});

	// Anything that hit zero or dropped under its reorder point is a purchase somebody has to make.
	await avisarStockBajo(
		pendientes.map((p) => p.concepto.productoId!),
		input.actor.id,
	);

	return resultado;
}

/** Tell whoever buys parts that something ran out. One notification per product, only on the edge. */
export async function avisarStockBajo(productoIds: string[], excepto?: string | null) {
	if (productoIds.length === 0) return;
	try {
		const productos = await prisma.producto.findMany({
			where: { id: { in: [...new Set(productoIds)] }, controlaInventario: true },
			select: { id: true, nombre: true, unidad: true, existencia: true, minimo: true },
		});

		for (const p of productos) {
			const existencia = Number(p.existencia);
			const minimo = p.minimo === null ? null : Number(p.minimo);
			const bajo = existencia <= 0 || (minimo !== null && existencia <= minimo);
			if (!bajo) continue;

			await notificar({
				evento: "stock_bajo",
				destino: { difusion: true },
				titulo: existencia <= 0 ? "Se acabó una refacción" : "Refacción bajo mínimo",
				cuerpo: `${p.nombre}: quedan ${existencia.toFixed(3).replace(/\.?0+$/, "")} ${p.unidad}`,
				url: `/panel/inventario?bajos=1`,
				entidad: "producto",
				entidadId: p.id,
				excepto,
			});
		}
	} catch (err) {
		console.error("avisarStockBajo falló:", err);
	}
}

export { IVA };
