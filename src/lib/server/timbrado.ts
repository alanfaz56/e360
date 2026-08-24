/**
 * Stamping an invoice at the SAT, and cancelling one.
 *
 * Its own file rather than more of `comercial.ts`: the money rules there are ours and settled,
 * while this is a conversation with an outside service that can be slow, down, or replaced. The
 * provider itself is behind `ProveedorTimbrado` — nothing here knows which PAC is answering.
 *
 * The order of operations is the whole design:
 *
 * 1. Read and validate everything we control, and refuse early with a Spanish message.
 * 2. Call the PAC. **Outside any transaction** — a stamp takes seconds, and a database
 *    transaction held open across a network call is a lock the whole shop waits behind.
 * 3. Write the result in one short transaction, with its audit entry.
 *
 * Which means the failure that matters is: stamped at the SAT, not written here. It is loud in
 * the log with the UUID in it, because that document exists whatever our row says, and somebody
 * has to reconcile it by hand. The alternative — writing first and stamping after — would produce
 * rows claiming a folio fiscal that was never issued, which is worse.
 */
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { pesos } from "$lib/comercial";
import { aCentavos, monto } from "./comercial";
import {
	armarConceptos,
	esMotivoCancelacion,
	esUuid,
	formaPagoClave,
	metodoPagoClave,
	requiereSustituto,
	type SolicitudTimbrado,
} from "$lib/facturacion";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import { proveedorActivo, type ConfigPac, type ProveedorTimbrado } from "./pac";
import type { Actor } from "./guard";

/** How long a `timbrandoAt` claim is honored before it's treated as an abandoned attempt (crash,
 *  timeout) rather than one still in flight. Generous margin over the PAC's own 30s timeout. */
const CLAIM_STALE_MS = 2 * 60_000;

/**
 * Everything a CFDI needs that we hold, gathered and checked before a single byte goes out.
 *
 * Refusing here rather than letting the PAC refuse is not politeness: their message names their
 * field, ours names the screen the person has to go fix.
 */
async function prepararTimbrado(facturaId: string) {
	const factura = await prisma.factura.findUnique({
		where: { id: facturaId },
		include: {
			cliente: true,
			// The INVOICE's own lines, copied at issue. Not the quote's: re-quoting later must never
			// change what a stamped document said, and an ad-hoc invoice has no quote at all.
			conceptos: { orderBy: { orden: "asc" } },
			pagos: { orderBy: { pagadoAt: "asc" }, take: 1 },
		},
	});
	if (!factura) throw new ClienteError(404, "Factura no encontrada");

	if (factura.estado === "cancelada") throw new ClienteError(409, "Una factura cancelada ya no se timbra.");
	if (factura.uuid) throw new ClienteError(409, `Esa factura ya está timbrada (UUID ${factura.uuid}).`);
	if (factura.timbrandoAt && Date.now() - factura.timbrandoAt.getTime() < CLAIM_STALE_MS) {
		throw new ClienteError(409, "Esa factura ya se está timbrando en este momento. Espera un momento y revisa.");
	}

	const c = factura.cliente;
	const faltantes = [
		[c.rfc, "el RFC"],
		[c.regimenFiscal, "el régimen fiscal"],
		[c.codigoPostal, "el código postal"],
		[c.usoCfdi, "el uso de CFDI"],
	]
		.filter(([v]) => !v)
		.map(([, nombre]) => nombre as string);

	if (faltantes.length > 0) {
		throw new ClienteError(
			409,
			`Para timbrar falta ${faltantes.join(", ")} de ${c.nombreCompleto}. Complétalo en su ficha de cliente.`,
		);
	}

	// Only reachable for invoices issued before `factura_concepto` existed and never linked to a
	// quote — the migration backfilled every one that had a quote behind it.
	const conceptos = factura.conceptos;
	if (conceptos.length === 0) {
		throw new ClienteError(
			409,
			"Esa factura no tiene conceptos guardados. Un CFDI necesita el detalle: cancélala y vuelve a emitirla.",
		);
	}

	return { factura, cliente: c, conceptos };
}

/** The customer's own fields the PAC will accept, checked once. */
type ClienteFiscal = {
	id: string;
	nombreCompleto: string;
	rfc: string | null;
	regimenFiscal: string | null;
	codigoPostal: string | null;
	usoCfdi: string | null;
	email: string | null;
	direccion: string | null;
	facturaComUid: string | null;
	facturaComEntorno: string | null;
};

/**
 * Find or create this customer AT the provider, and remember which one they are.
 *
 * The uid is stored so a customer is registered once rather than looked up on every sale, and it
 * is stored **with its environment**: a sandbox uid names nothing in production, and stamping
 * against a receptor that does not exist fails with a message that names neither the customer nor
 * the cause.
 *
 * Its own function because two callers need it — stamping, which does it on the way past, and the
 * customer screen, which does it on purpose so the link can be checked before an invoice depends
 * on it.
 */
export async function vincularReceptor(
	cliente: ClienteFiscal,
	proveedor: ProveedorTimbrado,
	cfg: ConfigPac,
): Promise<string> {
	const faltantes = [
		[cliente.rfc, "el RFC"],
		[cliente.regimenFiscal, "el régimen fiscal"],
		[cliente.codigoPostal, "el código postal"],
		[cliente.usoCfdi, "el uso de CFDI"],
	]
		.filter(([v]) => !v)
		.map(([, nombre]) => nombre as string);

	if (faltantes.length > 0) {
		throw new ClienteError(
			409,
			`Para facturar falta ${faltantes.join(", ")} de ${cliente.nombreCompleto}. Complétalo en su ficha.`,
		);
	}

	const uidVigente = cliente.facturaComEntorno === cfg.entorno ? cliente.facturaComUid : null;

	const receptorId = await proveedor.asegurarReceptor(
		cfg,
		{
			rfc: cliente.rfc!,
			nombre: cliente.nombreCompleto,
			codigoPostal: cliente.codigoPostal!,
			regimenFiscal: cliente.regimenFiscal!,
			usoCfdi: cliente.usoCfdi!,
			email: cliente.email,
			// One free-text address column here, several fields over there. Only what we actually
			// hold is sent; inventing a colonia to fill a form is how a CFDI ends up with an address
			// nobody can deliver to.
			calle: cliente.direccion,
			numero: null,
			colonia: null,
			ciudad: null,
			estado: null,
		},
		uidVigente,
	);

	if (receptorId !== cliente.facturaComUid || cliente.facturaComEntorno !== cfg.entorno) {
		await prisma.cliente.update({
			where: { id: cliente.id },
			data: { facturaComUid: receptorId, facturaComEntorno: cfg.entorno },
		});
	}

	return receptorId;
}

/**
 * Link a customer to the PAC on purpose, from their own screen.
 *
 * Reuses `factura:timbrar` rather than adding a key: this is the first half of stamping, run early
 * so the link can be verified before an invoice depends on it. It creates nothing on our side and
 * nothing that costs anything — a receptor at the PAC is free.
 */
export async function vincularClienteConPac(input: { actor: Actor; clienteId: string }) {
	if (!can(input.actor.role, "factura:timbrar")) throw new ClienteError(403, "Sin permiso: factura:timbrar");

	const cliente = await prisma.cliente.findUnique({ where: { id: input.clienteId } });
	if (!cliente) throw new ClienteError(404, "Cliente no encontrado");

	const { proveedor, cfg } = await proveedorActivo();
	const uid = await vincularReceptor(cliente, proveedor, cfg);

	await recordAudit(prisma, {
		action: "cliente.pac_link",
		actor: input.actor,
		entityId: cliente.id,
		entityLabel: cliente.nombreCompleto,
		summary: `${cliente.nombreCompleto} vinculado con ${proveedor.label} (${cfg.entorno})`,
		after: { uid, entorno: cfg.entorno, proveedor: proveedor.clave },
	});

	return { uid, entorno: cfg.entorno };
}

/**
 * What the PAC actually has on file for this customer's RFC, for the admin screen that shows a
 * customer's fiscal link. Reuses `factura:timbrar`: it is the same "talk to the PAC" capability
 * `vincularClienteConPac` already needs, not a new question of who may see it.
 */
export async function obtenerReceptorPac(input: { actor: Actor; clienteId: string }) {
	if (!can(input.actor.role, "factura:timbrar")) throw new ClienteError(403, "Sin permiso: factura:timbrar");

	const cliente = await prisma.cliente.findUnique({ where: { id: input.clienteId }, select: { rfc: true } });
	if (!cliente) throw new ClienteError(404, "Cliente no encontrado");
	if (!cliente.rfc) return null;

	const { proveedor, cfg } = await proveedorActivo();
	return await proveedor.obtenerReceptor(cfg, cliente.rfc);
}

/**
 * Stamp. `factura:timbrar` — Admin and Gerente.
 *
 * Irreversible: undoing it is a cancellation the SAT has to accept, and it spends a timbre either
 * way. That is why it is its own permission and its own explicit action, never a side effect of
 * issuing the invoice.
 */
export async function timbrarFactura(input: { actor: Actor; id: string }) {
	if (!can(input.actor.role, "factura:timbrar")) throw new ClienteError(403, "Sin permiso: factura:timbrar");

	const { factura, cliente, conceptos } = await prepararTimbrado(input.id);
	const { proveedor, cfg } = await proveedorActivo();

	const receptorId = await vincularReceptor(cliente, proveedor, cfg);

	const ivaTotal = aCentavos(factura.iva);
	const lineas = armarConceptos(conceptos, ivaTotal);

	// The lines are the document. If they do not add up to what the invoice says, something is
	// wrong on OUR side and sending it would either be rejected by the SAT or — worse — accepted
	// for an amount nobody agreed to.
	const sumaLineas = lineas.reduce((s, l) => s + l.importe, 0n);
	if (sumaLineas !== aCentavos(factura.subtotal)) {
		throw new ClienteError(
			409,
			`Los conceptos suman $${pesos(sumaLineas)} y la factura dice $${monto(factura.subtotal)}. No se timbra hasta que cuadren.`,
		);
	}

	const solicitud: SolicitudTimbrado = {
		receptorId,
		rfc: cliente.rfc!,
		usoCfdi: cliente.usoCfdi!,
		metodoPago: metodoPagoClave(factura.condicionPago),
		// What they actually paid with, when they already paid. A credit sale has no form of
		// payment yet, and `formaPagoClave` answers 99 (por definir) rather than inventing cash.
		formaPago: formaPagoClave(factura.pagos[0]?.metodo ?? null),
		serie: cfg.serie,
		moneda: "MXN",
		conceptos: lineas,
		subtotal: aCentavos(factura.subtotal),
		iva: ivaTotal,
		total: aCentavos(factura.total),
		// Our own folio on the document: a customer calling about "la 1042" is asking about this,
		// not about the SAT's UUID, and nothing else on the CFDI carries it.
		observaciones: `Factura #${factura.folio} · Estación 360`,
	};

	// Claim the row right before the network call, atomically: `uuid: null` and no fresh claim
	// already held is the same condition `prepararTimbrado` just checked, but re-asserted as a
	// single conditional write instead of a separate read — so two requests that both passed that
	// read a moment apart can't both win this. The loser gets the same "ya se está timbrando"
	// message a moment sooner than it would from the PAC's own eventual response.
	const claimado = await prisma.factura.updateMany({
		where: {
			id: factura.id,
			uuid: null,
			OR: [{ timbrandoAt: null }, { timbrandoAt: { lt: new Date(Date.now() - CLAIM_STALE_MS) } }],
		},
		data: { timbrandoAt: new Date() },
	});
	if (claimado.count === 0) {
		throw new ClienteError(409, "Esa factura ya se está timbrando en este momento. Espera un momento y revisa.");
	}

	const resultado = await proveedor.timbrar(cfg, solicitud);

	try {
		return await prisma.$transaction(async (tx) => {
			const actualizada = await tx.factura.update({
				where: { id: factura.id },
				data: {
					uuid: resultado.uuid,
					pacUid: resultado.referencia,
					pacEntorno: cfg.entorno,
					timbradaAt: resultado.timbradaAt,
					serie: resultado.serie ?? factura.serie,
					// An invoice stamped while still `borrador` is issued by that act.
					estado: factura.estado === "borrador" ? "emitida" : factura.estado,
					emitidaAt: factura.emitidaAt ?? resultado.timbradaAt,
				},
			});

			await recordAudit(tx, {
				action: "factura.timbrar",
				actor: input.actor,
				entityId: actualizada.id,
				entityLabel: `Factura #${actualizada.folio} · ${cliente.nombreCompleto}`,
				summary: `Factura #${actualizada.folio} timbrada (${cfg.entorno}) — UUID ${resultado.uuid}`,
				before: { uuid: null, estado: factura.estado },
				after: {
					uuid: resultado.uuid,
					entorno: cfg.entorno,
					proveedor: proveedor.clave,
					serie: resultado.serie,
					folio: resultado.folio,
					total: actualizada.total.toString(),
				},
			});

			return actualizada;
		});
	} catch (err) {
		// The document EXISTS at the SAT and we failed to record it. Nothing can undo that from
		// here, so it is logged with everything needed to reconcile by hand.
		console.error(
			`[timbrado] FACTURA TIMBRADA SIN GUARDAR — factura ${factura.id} (#${factura.folio}), UUID ${resultado.uuid}, uid ${resultado.referencia}, entorno ${cfg.entorno}`,
			err,
		);
		throw new ClienteError(
			500,
			`La factura SÍ se timbró (UUID ${resultado.uuid}) pero no se pudo guardar. No la vuelvas a timbrar: repórtalo con ese UUID.`,
		);
	}
}

/**
 * Cancel at the SAT, then in our own records.
 *
 * Reuses `factura:cancel` on purpose: once a PAC is wired, cancelling the row WITHOUT cancelling
 * at the SAT is a lie — the fiscal document keeps existing. So this is what cancelling means now,
 * not a second capability beside it.
 *
 * The SAT is asked FIRST. A row marked cancelled over a document that is still live is the
 * expensive direction of that mistake.
 */
export async function cancelarEnSat(input: {
	actor: Actor;
	id: string;
	motivo: unknown;
	sustituye: unknown;
	explicacion: unknown;
}) {
	if (!can(input.actor.role, "factura:cancel")) throw new ClienteError(403, "Sin permiso: factura:cancel");

	const motivo = trim(input.motivo);
	if (!esMotivoCancelacion(motivo)) throw new ClienteError(400, "Elige un motivo de cancelación del SAT (01–04).");

	const sustituye = trim(input.sustituye);
	if (requiereSustituto(motivo) && !esUuid(sustituye)) {
		throw new ClienteError(400, "El motivo 01 necesita el UUID de la factura que la sustituye.");
	}
	if (!requiereSustituto(motivo) && sustituye) {
		throw new ClienteError(400, "Solo el motivo 01 lleva factura sustituta.");
	}

	// Our own reason, in words, for the trail and for whoever reads the invoice later. The SAT
	// clave says which box was ticked; it never says why.
	const explicacion = trim(input.explicacion, 255, "El motivo") ?? "";
	if (!explicacion) throw new ClienteError(400, "Explica en una línea por qué se cancela.");

	const factura = await prisma.factura.findUnique({
		where: { id: input.id },
		include: { cliente: { select: { nombreCompleto: true } }, pagos: { select: { id: true } } },
	});
	if (!factura) throw new ClienteError(404, "Factura no encontrada");
	if (factura.estado === "cancelada") throw new ClienteError(409, "Ya está cancelada.");
	if (!factura.uuid || !factura.pacUid) {
		throw new ClienteError(409, "Esa factura no está timbrada: cancélala con la acción normal.");
	}
	if (factura.pagos.length > 0) {
		throw new ClienteError(
			409,
			`No se cancela una factura con ${factura.pagos.length} pago(s) registrado(s). Aplica una nota de crédito.`,
		);
	}

	const { proveedor, cfg } = await proveedorActivo();
	// Cancelling in production a document stamped in sandbox — or the reverse — reaches a UID that
	// does not exist there and fails with a message about nothing.
	if (factura.pacEntorno !== cfg.entorno) {
		throw new ClienteError(
			409,
			`Esa factura se timbró en ${factura.pacEntorno} y ahora estás en ${cfg.entorno}. Cambia el entorno en Ajustes antes de cancelarla.`,
		);
	}

	const resultado = await proveedor.cancelar(cfg, factura.pacUid, motivo, sustituye);

	return await prisma.$transaction(async (tx) => {
		const actualizada = await tx.factura.update({
			where: { id: factura.id },
			data: {
				// `en_proceso` is NOT cancelled: the SAT is waiting for the receiver to accept, and
				// until then the document is live. Marking it cancelled here would let the shop
				// re-invoice against a CFDI that still exists.
				...(resultado.estatus === "cancelada"
					? { estado: "cancelada", canceladaAt: new Date(), canceladoMotivo: explicacion }
					: {}),
				cancelacionEstatus: resultado.estatus,
				cancelacionMotivo: motivo,
				cancelacionSustituye: sustituye ?? null,
			},
		});

		await recordAudit(tx, {
			action: "factura.cancelar_sat",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: `Factura #${actualizada.folio} · ${factura.cliente?.nombreCompleto ?? ""}`,
			summary: `Factura #${actualizada.folio} — cancelación ${resultado.estatus} ante el SAT (motivo ${motivo}): ${explicacion}`,
			before: { estado: factura.estado, uuid: factura.uuid },
			after: {
				estado: actualizada.estado,
				cancelacionEstatus: resultado.estatus,
				motivo,
				sustituye: sustituye ?? null,
				respuesta: resultado.mensaje,
			},
		});

		return { factura: actualizada, resultado };
	});
}

/** The stamped document itself. Streamed straight through — never stored, never cached. */
export async function documentoDeFactura(input: { actor: Actor; id: string; formato: "pdf" | "xml" }) {
	if (!can(input.actor.role, "factura:read")) throw new ClienteError(403, "Sin permiso: factura:read");

	const factura = await prisma.factura.findUnique({
		where: { id: input.id },
		select: { folio: true, pacUid: true, pacEntorno: true, uuid: true },
	});
	if (!factura) throw new ClienteError(404, "Factura no encontrada");
	if (!factura.pacUid) throw new ClienteError(409, "Esa factura todavía no está timbrada.");

	const { proveedor, cfg } = await proveedorActivo();
	if (factura.pacEntorno !== cfg.entorno) {
		throw new ClienteError(409, `Esa factura vive en ${factura.pacEntorno} y ahora estás en ${cfg.entorno}.`);
	}

	const doc = await proveedor.descargar(cfg, factura.pacUid, input.formato);
	// Their filename is a uid nobody recognises. Ours is the folio the customer asked about.
	return { ...doc, nombre: `factura-${factura.folio}.${input.formato}` };
}

/**
 * What stamping has cost, for the settings screen.
 *
 * Counted from OUR rows, not from the provider: their usage endpoint is per-plan and per-provider,
 * and the question being asked here — "how many timbres did this shop spend" — is answerable from
 * the invoices we stamped. Sandbox is counted separately because it spends nothing.
 */
export async function usoDeTimbrado(desde: Date) {
	const [porEntorno, ultimas, sinTimbrar] = await Promise.all([
		prisma.factura.groupBy({
			by: ["pacEntorno"],
			where: { timbradaAt: { gte: desde } },
			_count: true,
		}),
		prisma.factura.findMany({
			where: { timbradaAt: { not: null } },
			orderBy: { timbradaAt: "desc" },
			take: 5,
			select: { id: true, folio: true, uuid: true, timbradaAt: true, pacEntorno: true, total: true },
		}),
		prisma.factura.count({ where: { uuid: null, estado: { notIn: ["cancelada", "borrador"] } } }),
	]);

	const cuenta = (entorno: string) => porEntorno.find((g) => g.pacEntorno === entorno)?._count ?? 0;

	return {
		desde: desde.toISOString(),
		produccion: cuenta("produccion"),
		sandbox: cuenta("sandbox"),
		sinTimbrar,
		ultimas: ultimas.map((f) => ({
			id: f.id,
			folio: f.folio,
			uuid: f.uuid,
			entorno: f.pacEntorno,
			total: monto(f.total),
			timbradaAt: f.timbradaAt?.toISOString() ?? null,
		})),
	};
}
