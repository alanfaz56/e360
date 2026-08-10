import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import {
	INVENTARIO_ITEM_KEYS,
	LIBERACION_ITEM_KEYS,
	NOTA_ESTADOS_ABIERTOS,
	limiteDeTipo,
	megas,
	tipoDeMime,
	combustibleLabel,
	esMimePermitido,
	isFotoCategoria,
	isInventarioItem,
	isLiberacionItem,
	isNotaEstado,
	isQaDestino,
	isQaResultado,
	isRespuestaLiberacion,
	notaEstadoClienteLabel,
	notaEstadoLabel,
	puedeTransicionarNota,
	qaDestinoPorDefecto,
	qaResultadoLabel,
	qaSigueEnTaller,
	type NotaEstado,
} from "$lib/notas";
import { TALLER_PUEDE_RECIBIR } from "$lib/talleres";
import { conceptoTipoLabel, cotizacionEstadoLabel, facturaEstadoLabel } from "$lib/comercial";
import { tallerMencionado } from "./talleres";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import { listSolicitudes } from "./inventario";
import { avisarClienteDeNota, notificar, nuevoTokenSeguimiento } from "./notificaciones";
import { pageMeta, parsePageParams, skipFor, type PageParams } from "./paginate";
import { borrarObjeto, firmarSubida, urlDeLectura } from "./r2";
import type { Actor } from "./guard";

export { ClienteError as NotaError };

const int = (v: unknown): number | null => {
	if (v === undefined || v === null || v === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? Math.trunc(n) : null;
};

export const notaLabel = (n: {
	folio: number;
	unidad?: { marca: string; modelo: string; placas: string | null } | null;
	cliente?: { nombreCompleto: string } | null;
}) =>
	[
		`#${n.folio}`,
		n.cliente?.nombreCompleto,
		n.unidad && [`${n.unidad.marca} ${n.unidad.modelo}`, n.unidad.placas].filter(Boolean).join(" "),
	]
		.filter(Boolean)
		.join(" · ");

const INCLUDE = {
	cliente: { select: { nombreCompleto: true, tipo: true, telefono: true } },
	unidad: {
		select: { marca: true, modelo: true, anio: true, placas: true, vin: true, numeroEconomico: true },
	},
	recibidaPor: { select: { name: true, email: true } },
	mecanico: { select: { id: true, name: true, email: true } },
	tallerActual: { select: { nombre: true, telefono: true } },
	entregadaAContacto: { select: { nombre: true } },
	liberadaPor: { select: { name: true } },
	cita: { select: { folio: true } },
	_count: { select: { evidencias: true, comentarios: true, cotizaciones: true, facturas: true } },
} satisfies Prisma.nota_servicioInclude;

type NotaRow = Prisma.nota_servicioGetPayload<{ include: typeof INCLUDE }>;

/** Shape returned by the API. Explicit mapper — never spread a Prisma row (Rule 4). */
export const publicNota = (n: NotaRow) => ({
	id: n.id,
	folio: n.folio,
	estado: n.estado,
	estadoLabel: notaEstadoLabel(n.estado),
	citaId: n.citaId,
	citaFolio: n.cita?.folio ?? null,
	clienteId: n.clienteId,
	clienteNombre: n.cliente?.nombreCompleto ?? null,
	clienteTelefono: n.cliente?.telefono ?? null,
	unidadId: n.unidadId,
	unidadEtiqueta: n.unidad
		? [`${n.unidad.marca} ${n.unidad.modelo}`, n.unidad.anio, n.unidad.placas].filter(Boolean).join(" · ")
		: null,
	unidadNumeroEconomico: n.unidad?.numeroEconomico ?? null,
	unidadVin: n.unidad?.vin ?? null,
	recibidaPorId: n.recibidaPorId,
	recibidaPorNombre: n.recibidaPor?.name ?? null,
	recibidaAt: n.recibidaAt.toISOString(),
	// Who handed the vehicle over. Often not a registered contact — see `resolverQuienEntrego`.
	entregoNombre: n.entregoNombre,
	entregoTelefono: n.entregoTelefono,
	entregoContactoId: n.entregoContactoId,
	mecanicoId: n.mecanicoId,
	mecanicoNombre: n.mecanico?.name ?? null,
	trabajoTerminadoAt: n.trabajoTerminadoAt?.toISOString() ?? null,
	kilometraje: n.kilometraje,
	combustibleOctavos: n.combustibleOctavos,
	combustibleLabel: combustibleLabel(n.combustibleOctavos),
	condicion: n.condicion,
	inspeccionAt: n.inspeccionAt?.toISOString() ?? null,
	inspeccionada: n.inspeccionAt !== null,
	motivo: n.motivo,
	diagnostico: n.diagnostico,
	observaciones: n.observaciones,
	tallerActualId: n.tallerActualId,
	tallerActualNombre: n.tallerActual?.nombre ?? null,
	entregadaAt: n.entregadaAt?.toISOString() ?? null,
	entregadaANombre: n.entregadaAContacto?.nombre ?? null,
	canceladoMotivo: n.canceladoMotivo,
	unidadLiberada: n.unidadLiberada,
	liberacionAt: n.liberacionAt?.toISOString() ?? null,
	liberadaPorNombre: n.liberadaPor?.name ?? null,
	observacionesLiberacion: n.observacionesLiberacion,
	etiqueta: notaLabel(n),
	evidencias: n._count.evidencias,
	comentarios: n._count.comentarios,
	cotizaciones: n._count.cotizaciones,
	facturas: n._count.facturas,
	createdAt: n.createdAt.toISOString(),
});

// --- Reading ---------------------------------------------------------------------------------

/**
 * The note as the CUSTOMER may see it.
 *
 * Estación 360 sources jobs out to partner workshops and is the one the customer holds
 * responsible. Handing them the partner's name invites them to go straight there next time,
 * cutting out the shop that found the work, priced it and warranties it — so nothing about a
 * taller crosses this boundary: not the name, not the estado label, not the transfer history,
 * and not the internal comments where staff discuss it.
 *
 * This mapper is the ONLY thing that should ever build customer-facing note data. Anything that
 * reaches a customer goes through here, so the rule lives in one place instead of being
 * re-remembered at every new surface.
 */
export const notaParaCliente = (n: NotaRow) => ({
	folio: n.folio,
	estado: n.estado,
	// Deliberately the customer-facing label: `en_taller` reads as ordinary progress.
	estadoLabel: notaEstadoClienteLabel(n.estado),
	unidad: n.unidad ? `${n.unidad.marca} ${n.unidad.modelo}` : null,
	placas: n.unidad?.placas ?? null,
	recibidaAt: n.recibidaAt.toISOString(),
	kilometraje: n.kilometraje,
	motivo: n.motivo,
	entregadaAt: n.entregadaAt?.toISOString() ?? null,
	// NO tallerActualId, NO tallerActualNombre, NO transferencias, NO diagnostico interno.
});

/**
 * The whole customer-facing view of one note, resolved from its tracking token.
 *
 * **The token IS the credential.** There is no account behind it — the shop has no public
 * registration — so the link is 256 random bits and is handed over by WhatsApp to a number
 * already on file. Anyone holding it sees this and nothing else.
 *
 * Everything here goes through `notaParaCliente` or is filtered to `interno: false`, so the
 * partner workshop stays invisible on this surface too: not in the estado, not in the comments,
 * not in the photo captions of an internal note.
 */
export async function seguimientoPorToken(token: string) {
	if (!token || token.length < 32) throw new ClienteError(404, "Liga de seguimiento no válida.");

	const nota = await prisma.nota_servicio.findUnique({
		where: { seguimientoToken: token },
		include: INCLUDE,
	});
	if (!nota) throw new ClienteError(404, "Liga de seguimiento no válida.");

	const [comentarios, avisos, cotizaciones, facturas] = await Promise.all([
		prisma.nota_comentario.findMany({
			// Visible ones only. `comentarNota` already refuses to mark a comment visible if it
			// names a taller, so this list is safe to show verbatim.
			where: { notaId: nota.id, interno: false },
			orderBy: { createdAt: "desc" },
			take: 30,
			select: { id: true, texto: true, createdAt: true, adjuntos: { select: ADJUNTOS_SELECT } },
		}),
		prisma.notificacion.findMany({
			where: { clienteId: nota.clienteId, entidad: "nota", entidadId: nota.id },
			orderBy: { createdAt: "desc" },
			take: 30,
			select: { id: true, titulo: true, cuerpo: true, createdAt: true },
		}),
		prisma.cotizacion.findMany({
			// A draft is not something the customer has been shown yet.
			where: { notaId: nota.id, estado: { notIn: ["borrador"] } },
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				folio: true,
				estado: true,
				subtotal: true,
				iva: true,
				total: true,
				vigenciaHasta: true,
				enviadaAt: true,
				// The line items, because "¿qué me van a cobrar?" is the whole question. Safe by
				// construction: `exigirSinTaller` refuses a description naming a partner shop at
				// write time, so nothing has to be redacted on the way out.
				conceptos: {
					orderBy: { orden: "asc" },
					select: {
						id: true,
						tipo: true,
						descripcion: true,
						cantidad: true,
						precioUnitario: true,
						importe: true,
					},
				},
			},
		}),
		prisma.factura.findMany({
			where: { notaId: nota.id, estado: { not: "borrador" } },
			orderBy: { createdAt: "desc" },
			select: { id: true, folio: true, estado: true, total: true, vence: true },
		}),
	]);

	return {
		nota: notaParaCliente(nota),
		cliente: nota.cliente?.nombreCompleto ?? null,
		clienteId: nota.clienteId,
		comentarios: comentarios.map((c) => ({
			id: c.id,
			texto: c.texto,
			createdAt: c.createdAt.toISOString(),
			adjuntos: c.adjuntos.map(adjuntoPublico),
		})),
		avisos: avisos.map((a) => ({
			id: a.id,
			titulo: a.titulo,
			cuerpo: a.cuerpo,
			createdAt: a.createdAt.toISOString(),
		})),
		cotizaciones: cotizaciones.map((c) => ({
			folio: c.folio,
			estado: c.estado,
			estadoLabel: cotizacionEstadoLabel(c.estado),
			// `.toFixed(2)`, never `.toString()`: Decimal drops trailing zeros and 5050.00 would
			// serialize as "5050".
			subtotal: c.subtotal.toFixed(2),
			iva: c.iva.toFixed(2),
			total: c.total.toFixed(2),
			vigenciaHasta: c.vigenciaHasta?.toISOString() ?? null,
			enviadaAt: c.enviadaAt?.toISOString() ?? null,
			conceptos: c.conceptos.map((x) => ({
				id: x.id,
				tipoLabel: conceptoTipoLabel(x.tipo),
				descripcion: x.descripcion,
				cantidad: x.cantidad.toFixed(2),
				precioUnitario: x.precioUnitario.toFixed(2),
				importe: x.importe.toFixed(2),
			})),
		})),
		facturas: facturas.map((f) => ({
			folio: f.folio,
			estado: f.estado,
			estadoLabel: facturaEstadoLabel(f.estado),
			total: f.total.toFixed(2),
			vence: f.vence?.toISOString() ?? null,
		})),
	};
}

export type NotaQuery = {
	q?: string | null;
	estado?: string | null;
	clienteId?: string | null;
	unidadId?: string | null;
	tallerId?: string | null;
	abiertas?: boolean;
} & Partial<PageParams>;

export function parseNotaQuery(params: URLSearchParams): NotaQuery {
	return {
		q: params.get("q"),
		estado: params.get("estado"),
		clienteId: params.get("clienteId"),
		unidadId: params.get("unidadId"),
		tallerId: params.get("tallerId"),
		abiertas: params.get("abiertas") === "1",
		...parsePageParams(params),
	};
}

export async function listNotas(query: NotaQuery) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 25 };
	const folio = query.q ? Number(query.q.replace("#", "")) : NaN;

	const where: Prisma.nota_servicioWhereInput = {
		...(isNotaEstado(query.estado) ? { estado: query.estado } : {}),
		...(query.abiertas ? { estado: { in: NOTA_ESTADOS_ABIERTOS } } : {}),
		...(query.clienteId ? { clienteId: query.clienteId } : {}),
		...(query.unidadId ? { unidadId: query.unidadId } : {}),
		...(query.tallerId ? { tallerActualId: query.tallerId } : {}),
		...(query.q
			? {
					OR: [
						...(Number.isInteger(folio) ? [{ folio }] : []),
						{ motivo: { contains: query.q, mode: "insensitive" as const } },
						{ cliente: { nombreCompleto: { contains: query.q, mode: "insensitive" as const } } },
						{ unidad: { placas: { contains: query.q, mode: "insensitive" as const } } },
						{ unidad: { numeroEconomico: { contains: query.q, mode: "insensitive" as const } } },
						{ unidad: { vin: { contains: query.q, mode: "insensitive" as const } } },
					],
				}
			: {}),
	};

	const [total, rows] = await Promise.all([
		prisma.nota_servicio.count({ where }),
		prisma.nota_servicio.findMany({
			where,
			orderBy: { recibidaAt: "desc" },
			skip: skipFor(paging),
			take: paging.perPage,
			include: INCLUDE,
		}),
	]);

	return { notas: rows.map(publicNota), ...pageMeta(total, paging) };
}

export async function getNota(id: string) {
	const nota = await prisma.nota_servicio.findUnique({ where: { id }, include: INCLUDE });
	if (!nota) throw new ClienteError(404, "Nota de servicio no encontrada");
	return nota;
}

/** Everything the detail screen shows, in one place. */
export async function getNotaDetalle(id: string) {
	const nota = await getNota(id);

	const [inventario, liberaciones, evidencias, comentarios, transferencias] = await Promise.all([
		prisma.nota_inventario.findMany({ where: { notaId: nota.id } }),
		prisma.nota_liberacion.findMany({ where: { notaId: nota.id } }),
		prisma.nota_evidencia.findMany({
			where: { notaId: nota.id },
			orderBy: { createdAt: "asc" },
			include: { subidaPor: { select: { name: true } } },
		}),
		prisma.nota_comentario.findMany({
			where: { notaId: nota.id },
			orderBy: { createdAt: "asc" },
			include: { adjuntos: { select: ADJUNTOS_SELECT } },
		}),
		prisma.nota_transferencia.findMany({
			where: { notaId: nota.id },
			orderBy: { desde: "desc" },
			include: {
				taller: { select: { nombre: true } },
				enviadaPor: { select: { name: true } },
				qaPor: { select: { name: true } },
			},
		}),
	]);

	return {
		nota: publicNota(nota),
		// The customer's tracking token. Deliberately NOT in `publicNota`: that mapper feeds the
		// list endpoints too, and a credential has no business appearing once per row. Staff need
		// it here, on the one screen where they send the link to the customer.
		seguimientoToken: nota.seguimientoToken,
		inventario: inventario.map((i) => ({ item: i.item, presente: i.presente, notas: i.notas })),
		liberaciones: liberaciones.map((l) => ({ item: l.item, respuesta: l.respuesta, notas: l.notas })),
		evidencias: evidencias.map((e) => ({
			id: e.id,
			tipo: e.tipo,
			categoria: e.categoria,
			nombre: e.nombre,
			contentType: e.contentType,
			bytes: e.bytes,
			descripcion: e.descripcion,
			subidaPor: e.subidaPor?.name ?? null,
			createdAt: e.createdAt.toISOString(),
			// Derived at read time: a stored signed URL would expire and rot into a broken image.
			url: urlDeLectura(e.clave),
		})),
		comentarios: comentarios.map((c) => ({
			id: c.id,
			texto: c.texto,
			interno: c.interno,
			autorEmail: c.autorEmail,
			createdAt: c.createdAt.toISOString(),
			adjuntos: c.adjuntos.map(adjuntoPublico),
		})),
		transferencias: transferencias.map((t) => ({
			id: t.id,
			tallerId: t.tallerId,
			tallerNombre: t.taller.nombre,
			motivo: t.motivo,
			desde: t.desde.toISOString(),
			hasta: t.hasta?.toISOString() ?? null,
			abierta: t.hasta === null,
			resultado: t.resultado,
			enviadaPor: t.enviadaPor?.name ?? null,
			qaResultado: t.qaResultado,
			qaNotas: t.qaNotas,
			qaAt: t.qaAt?.toISOString() ?? null,
			qaPor: t.qaPor?.name ?? null,
			// Still at the shop AND already judged once = the work was sent back for rework.
			rechazada: t.qaResultado === "rechazado" && t.hasta === null,
		})),
	};
}

// --- Intake ----------------------------------------------------------------------------------

/**
 * Open a service note. Called on arrival from a cita ("Recibir unidad") or standalone for a
 * walk-in.
 *
 * `clienteId` is captured HERE and never follows a later ownership transfer: the vehicle keeps one
 * continuous service history, but each job stays billed to whoever owned it that day.
 */
/**
 * Who handed the vehicle over at intake.
 *
 * Three real answers, and the third is why this exists: the customer themselves, one of their
 * registered contacts, or **somebody who is not in the registry at all** — a driver, a relative,
 * the neighbour who happened to be free. Refusing that case would mean either turning the vehicle
 * away or inventing a `cliente_contacto` nobody maintains.
 *
 * Handing OVER is not the same as collecting: taking a vehicle IN carries no risk of releasing it
 * to the wrong person, so it does not need the `entregador` authority that `entregarNota` enforces.
 * It is a record of who was standing there, and it is optional.
 *
 * A registered contact still gets its name snapshotted, so the note reads after that contact is
 * archived — and `nota_servicio_entrego_nombre_check` refuses the row otherwise.
 */
async function resolverQuienEntrego(clienteId: string, body: Record<string, unknown>) {
	const contactoId = trim(body.entregoContactoId);
	const nombreLibre = trim(body.entregoNombre, 120, "El nombre de quien entrega");
	const telefono = trim(body.entregoTelefono, 32, "El teléfono de quien entrega");

	if (contactoId) {
		const contacto = await prisma.cliente_contacto.findUnique({
			where: { id: contactoId },
			select: { clienteId: true, nombre: true, telefono: true, archivedAt: true },
		});
		if (!contacto) throw new ClienteError(404, "Contacto no encontrado");
		// A contact of ANOTHER customer standing in this record would be a lie about who was here.
		if (contacto.clienteId !== clienteId) {
			throw new ClienteError(400, "Ese contacto pertenece a otro cliente");
		}
		if (contacto.archivedAt) throw new ClienteError(409, "Ese contacto está archivado.");
		return {
			entregoContactoId: contactoId,
			entregoNombre: contacto.nombre,
			entregoTelefono: telefono ?? contacto.telefono,
		};
	}

	return { entregoContactoId: null, entregoNombre: nombreLibre, entregoTelefono: telefono };
}

export async function crearNota(input: { actor: Actor; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "nota:create")) throw new ClienteError(403, "Sin permiso: nota:create");

	const citaId = trim(input.body.citaId);
	let clienteId = trim(input.body.clienteId);
	let unidadId = trim(input.body.unidadId);
	let motivo = trim(input.body.motivo, 2000, "El motivo");

	if (citaId) {
		const cita = await prisma.cita.findUnique({
			where: { id: citaId },
			select: {
				id: true,
				estado: true,
				clienteId: true,
				unidadId: true,
				motivo: true,
				nota: { select: { id: true } },
			},
		});
		if (!cita) throw new ClienteError(404, "Cita no encontrada");
		if (cita.nota) throw new ClienteError(409, "Esa cita ya tiene una nota de servicio abierta.");
		if (cita.estado === "cancelada") throw new ClienteError(409, "Esa cita está cancelada.");
		// A cita must be linked before it can be confirmed, so by arrival time both of these exist.
		if (!cita.clienteId || !cita.unidadId) {
			throw new ClienteError(409, "Vincula la cita a un cliente y una unidad antes de recibir.");
		}
		clienteId ??= cita.clienteId;
		unidadId ??= cita.unidadId;
		motivo ??= cita.motivo;
	}

	if (!clienteId) throw new ClienteError(400, "Falta el cliente");
	if (!unidadId) throw new ClienteError(400, "Falta la unidad");
	if (!motivo) throw new ClienteError(400, "Falta el motivo de entrada");

	const unidad = await prisma.unidad.findUnique({
		where: { id: unidadId },
		select: { clienteId: true, archivedAt: true, kilometraje: true },
	});
	if (!unidad) throw new ClienteError(404, "Unidad no encontrada");
	if (unidad.clienteId !== clienteId) {
		throw new ClienteError(400, "Esa unidad no pertenece al cliente seleccionado");
	}
	if (unidad.archivedAt) throw new ClienteError(409, "Esa unidad está archivada.");

	// One vehicle, one open job. Two live notes for the same truck is how work gets duplicated
	// and invoiced twice.
	//
	// This reads before it writes, so on its own it loses the race two near-simultaneous submits
	// create — which is the ordinary shape of the bug, because a button that looks dead gets
	// tapped again. `nota_servicio_unidad_abierta_key` is what actually guarantees it; this check
	// survives to produce a Spanish message with the folio in it instead of a constraint dump.
	const abierta = await prisma.nota_servicio.findFirst({
		where: { unidadId, estado: { in: NOTA_ESTADOS_ABIERTOS } },
		select: { folio: true },
	});
	if (abierta) {
		throw new ClienteError(409, `Esa unidad ya tiene la nota #${abierta.folio} abierta.`);
	}

	const kilometraje = int(input.body.kilometraje);
	const entrego = await resolverQuienEntrego(clienteId!, input.body);

	const nota = await prisma
		.$transaction(async (tx) => {
			const creada = await tx.nota_servicio.create({
				data: {
					id: randomUUID(),
					citaId,
					clienteId: clienteId!,
					unidadId: unidadId!,
					motivo: motivo!,
					estado: "recibida",
					recibidaPorId: input.actor.id,
					...entrego,
					observaciones: trim(input.body.observaciones),
					// Minted at intake, so the customer can be sent their tracking link the moment the
					// vehicle is in. Generating it later would mean a note nobody can follow.
					seguimientoToken: nuevoTokenSeguimiento(),
				},
				include: INCLUDE,
			});

			// Arriving with the odometer already read is the common case, so take it now.
			if (kilometraje !== null) {
				await registrarKilometraje(tx, {
					actor: input.actor,
					unidadId: unidadId!,
					kilometraje,
					origen: "nota",
					notaId: creada.id,
					forzar: input.body.forzarKilometraje === "1" || input.body.forzarKilometraje === true,
				});
				// Re-read rather than mutate `creada` in place: the object above was built before this
				// update, so returning it would report a null odometer that the row does not have.
				Object.assign(
					creada,
					await tx.nota_servicio.update({
						where: { id: creada.id },
						data: { kilometraje },
						include: INCLUDE,
					}),
				);
			}

			// The appointment is DONE the moment the vehicle is here — that was its whole job. What
			// happens to the car from now on is the nota's business, and leaving the cita `en_proceso`
			// meant somebody had to close it by hand later, which nobody does: the "citas sin procesar"
			// counter filled up with appointments that had actually succeeded.
			if (citaId) {
				// `completada` is in REQUIEREN_HORA, so a request that never got an hour would violate
				// `cita_inicio_requerido_check` and surface as a raw 500. Stamp the arrival as the hour
				// first — it IS when the appointment happened — then complete it. Two statements, not a
				// data-modifying CTE: every part of one command shares a snapshot, so the second half
				// would not see the first.
				const VIVAS = ["solicitada", "confirmada", "en_proceso"];
				await tx.cita.updateMany({
					where: { id: citaId, estado: { in: VIVAS }, inicio: null },
					data: { inicio: new Date() },
				});
				await tx.cita.updateMany({
					where: { id: citaId, estado: { in: VIVAS } },
					data: { estado: "completada" },
				});
			}

			await recordAudit(tx, {
				action: citaId ? "cita.receive" : "nota.create",
				actor: input.actor,
				entityId: creada.id,
				entityLabel: notaLabel(creada),
				summary: citaId
					? `Unidad recibida de la cita #${creada.cita?.folio}: nota #${creada.folio}`
					: `Nota #${creada.folio} abierta sin cita`,
				after: { clienteId, unidadId, kilometraje, citaId },
			});

			return creada;
		})
		.catch((err) => {
			// The database won the race that the read-then-write check above cannot. Translate it into
			// the same 409 the check produces, so a double-tapped "Recibir unidad" reads as "ya está
			// abierta" instead of a constraint dump — and, crucially, so the operator does not go
			// looking for a second note that was never created.
			if ((err as { code?: string }).code === "P2002") {
				throw new ClienteError(409, "Esa unidad ya tiene una nota de servicio abierta.");
			}
			throw err;
		});

	// After the commit, never inside it: a slow push service must not hold a transaction open, and
	// a notification about a change that rolled back is a lie.
	await avisarPersonal(nota, {
		evento: "nota_abierta",
		titulo: `Llegó ${nota.unidad.marca} ${nota.unidad.modelo}`,
		cuerpo: `Nota #${nota.folio} · ${nota.cliente.nombreCompleto} — ${nota.motivo}`,
		excepto: input.actor.id,
	});
	await avisarCliente(nota, {
		evento: "cliente_unidad_recibida",
		titulo: "Recibimos tu unidad",
		cuerpo: `Ya está con nosotros. Puedes seguir el avance de la nota #${nota.folio} desde aquí.`,
	});

	return nota;
}

/**
 * Notify the shop floor about a note.
 *
 * Staff copy may say anything — including which partner shop has the vehicle. That is the whole
 * reason it is a separate function from `avisarCliente`: the two audiences have different rules
 * and mixing them in one call site is how the taller's name eventually reaches a customer.
 */
async function avisarPersonal(
	nota: { id: string; folio: number },
	aviso: {
		evento: "nota_abierta" | "nota_taller_retorno" | "nota_qa_rechazado";
		titulo: string;
		cuerpo: string;
		excepto?: string | null;
	},
) {
	await notificar({
		evento: aviso.evento,
		destino: { difusion: true },
		titulo: aviso.titulo,
		cuerpo: aviso.cuerpo,
		url: `/panel/notas/${nota.id}`,
		entidad: "nota",
		entidadId: nota.id,
		excepto: aviso.excepto,
	});
}

/**
 * Customer copy goes through `avisarClienteDeNota`, which is the one door that pins the deep link
 * to `/seguimiento/<token>` and restricts the event key to the `cliente_*` half of the catalogue.
 * Aliased here only so the call sites below read symmetrically with `avisarPersonal`.
 */
const avisarCliente = avisarClienteDeNota;

/**
 * Record an odometer reading, updating the unit's current value and the history together.
 *
 * `unidad.kilometraje` is the latest reading, denormalized so the unit list needs no subquery;
 * `unidad_kilometraje` is what makes "how much has this truck run between visits" and "how often
 * does it come in" answerable at all. Both are written in the SAME transaction — a current value
 * with no history behind it is how mileage quietly becomes fiction.
 *
 * Odometers do not run backwards. A lower reading is refused unless somebody explicitly says it
 * is a correction, and that override is stored on the row and in the audit.
 */
export async function registrarKilometraje(
	db: Prisma.TransactionClient,
	input: {
		actor: Actor;
		unidadId: string;
		kilometraje: number;
		origen: "nota" | "alta" | "manual";
		notaId?: string | null;
		forzar?: boolean;
		notas?: string | null;
	},
) {
	if (!Number.isInteger(input.kilometraje) || input.kilometraje < 0) {
		throw new ClienteError(400, "El kilometraje debe ser un número entero positivo");
	}

	const ultima = await db.unidad_kilometraje.findFirst({
		where: { unidadId: input.unidadId },
		orderBy: { medidoAt: "desc" },
		select: { kilometraje: true },
	});

	const retrocede = ultima !== null && input.kilometraje < ultima.kilometraje;
	if (retrocede && !input.forzar) {
		throw new ClienteError(
			409,
			`El kilometraje (${input.kilometraje.toLocaleString("es-MX")}) es menor al último registrado (${ultima.kilometraje.toLocaleString("es-MX")}). Verifica la lectura o márcala como corrección.`,
		);
	}

	const lectura = await db.unidad_kilometraje.create({
		data: {
			id: randomUUID(),
			unidadId: input.unidadId,
			kilometraje: input.kilometraje,
			origen: input.origen,
			notaId: input.notaId ?? null,
			registradoPorId: input.actor.id,
			correccion: retrocede,
			notas: trim(input.notas, 255, "La nota"),
		},
	});

	// Only move the unit's current value forward. A correction is recorded in the history but
	// must not rewrite the odometer to a lower number.
	if (!retrocede) {
		await db.unidad.update({
			where: { id: input.unidadId },
			data: { kilometraje: input.kilometraje },
		});
	}

	await recordAudit(db, {
		action: "unidad.kilometraje",
		actor: input.actor,
		entityId: input.unidadId,
		entityLabel: `${input.kilometraje.toLocaleString("es-MX")} km`,
		summary: retrocede
			? `Corrección de kilometraje a ${input.kilometraje.toLocaleString("es-MX")} (anterior ${ultima!.kilometraje.toLocaleString("es-MX")})`
			: `Kilometraje registrado: ${input.kilometraje.toLocaleString("es-MX")}`,
		before: { kilometraje: ultima?.kilometraje ?? null },
		after: { kilometraje: input.kilometraje, origen: input.origen, correccion: retrocede },
	});

	return lectura;
}

/**
 * The unit's mileage over time, plus what it says about usage.
 *
 * `kmPorDia` between consecutive readings is the number a fleet actually asks for; `visitas`
 * counts only the readings taken at intake, which is the "how often does it come in" question.
 */
export async function historialKilometraje(unidadId: string) {
	const lecturas = await prisma.unidad_kilometraje.findMany({
		where: { unidadId },
		orderBy: { medidoAt: "desc" },
		include: { nota: { select: { folio: true } }, registradoPor: { select: { name: true } } },
	});

	const ordenAscendente = [...lecturas].reverse();
	const conDeltas = ordenAscendente.map((l, i) => {
		const previa = i === 0 ? null : ordenAscendente[i - 1];
		const dias = previa
			? Math.max(1, Math.round((l.medidoAt.getTime() - previa.medidoAt.getTime()) / 86_400_000))
			: null;
		const recorrido = previa ? l.kilometraje - previa.kilometraje : null;
		return {
			id: l.id,
			kilometraje: l.kilometraje,
			origen: l.origen,
			medidoAt: l.medidoAt.toISOString(),
			notaId: l.notaId,
			notaFolio: l.nota?.folio ?? null,
			registradoPor: l.registradoPor?.name ?? null,
			correccion: l.correccion,
			notas: l.notas,
			recorrido,
			dias,
			kmPorDia: recorrido !== null && dias ? Math.round((recorrido / dias) * 10) / 10 : null,
		};
	});

	const visitas = lecturas.filter((l) => l.origen === "nota").length;
	const primera = ordenAscendente[0] ?? null;
	const ultima = ordenAscendente[ordenAscendente.length - 1] ?? null;
	const totalRecorrido = primera && ultima ? ultima.kilometraje - primera.kilometraje : 0;
	const diasTotales =
		primera && ultima
			? Math.max(1, Math.round((ultima.medidoAt.getTime() - primera.medidoAt.getTime()) / 86_400_000))
			: 0;

	return {
		lecturas: conDeltas.reverse(),
		resumen: {
			visitas,
			actual: ultima?.kilometraje ?? null,
			totalRecorrido,
			diasTotales,
			promedioKmPorDia: diasTotales > 0 ? Math.round((totalRecorrido / diasTotales) * 10) / 10 : null,
		},
	};
}

// --- Inspection ------------------------------------------------------------------------------

/**
 * The walk-around: mileage, fuel, condition and the inventory of what is in the vehicle.
 *
 * Idempotent — an operator finding a scratch they missed re-submits and the note is updated, with
 * `inspeccionAt` moving to the latest pass. Every submission is audited, so a quietly softened
 * damage note is still visible in the trail.
 */
export async function inspeccionarNota(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "nota:inspect")) throw new ClienteError(403, "Sin permiso: nota:inspect");

	const current = await getNota(input.id);
	if (current.estado === "cancelada" || current.estado === "entregada") {
		throw new ClienteError(409, `Una nota ${notaEstadoLabel(current.estado).toLowerCase()} ya no se inspecciona.`);
	}

	const kilometraje = int(input.body.kilometraje);
	const combustible = int(input.body.combustibleOctavos);
	if (combustible !== null && (combustible < 0 || combustible > 8)) {
		throw new ClienteError(400, "El combustible se registra en octavos, de 0 a 8");
	}

	// `{ item: "si"|"no" }` from the form, or a JSON array from the API. Unknown keys are dropped
	// rather than stored: the point of a fixed catalogue is that it stays fixed.
	const inventario = leerInventario(input.body.inventario);

	const nota = await prisma.$transaction(async (tx) => {
		if (kilometraje !== null && kilometraje !== current.kilometraje) {
			await registrarKilometraje(tx, {
				actor: input.actor,
				unidadId: current.unidadId,
				kilometraje,
				origen: "nota",
				notaId: current.id,
				forzar: input.body.forzarKilometraje === "1" || input.body.forzarKilometraje === true,
			});
		}

		if (inventario.length > 0) {
			await tx.nota_inventario.deleteMany({ where: { notaId: current.id } });
			await tx.nota_inventario.createMany({
				data: inventario.map((i) => ({ ...i, notaId: current.id })),
			});
		}

		const actualizada = await tx.nota_servicio.update({
			where: { id: current.id },
			data: {
				kilometraje: kilometraje ?? current.kilometraje,
				combustibleOctavos: combustible ?? current.combustibleOctavos,
				condicion: input.body.condicion !== undefined ? trim(input.body.condicion) : current.condicion,
				observaciones:
					input.body.observaciones !== undefined ? trim(input.body.observaciones) : current.observaciones,
				inspeccionAt: new Date(),
			},
			include: INCLUDE,
		});

		await recordAudit(tx, {
			action: "nota.inspect",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: notaLabel(actualizada),
			summary: `Inspección de entrada de la nota #${actualizada.folio}`,
			before: {
				kilometraje: current.kilometraje,
				combustibleOctavos: current.combustibleOctavos,
				condicion: current.condicion,
			},
			after: {
				kilometraje: actualizada.kilometraje,
				combustibleOctavos: actualizada.combustibleOctavos,
				condicion: actualizada.condicion,
				inventario: inventario.length,
			},
		});

		return actualizada;
	});

	await avisarCliente(nota, {
		evento: "cliente_inspeccion",
		titulo: "Terminamos la inspección de tu unidad",
		cuerpo: `Nota #${nota.folio}: ya quedó registrado cómo llegó, con fotos y kilometraje.`,
	});

	return nota;
}

function leerInventario(value: unknown): { item: string; presente: boolean; notas: string | null }[] {
	if (Array.isArray(value)) {
		return value
			.filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
			.filter((i) => isInventarioItem(i.item))
			.map((i) => ({
				item: String(i.item),
				presente: i.presente === true || i.presente === "si" || i.presente === "1",
				notas: trim(i.notas, 255, "La nota"),
			}));
	}
	if (typeof value === "object" && value !== null) {
		return Object.entries(value as Record<string, unknown>)
			.filter(([k]) => isInventarioItem(k))
			.map(([item, v]) => ({
				item,
				presente: v === true || v === "si" || v === "1",
				notas: null,
			}));
	}
	return [];
}

/** Which required checklist items have not been answered yet. Drives the "incomplete" warning. */
export async function faltantesInventario(notaId: string): Promise<string[]> {
	const respondidos = await prisma.nota_inventario.findMany({
		where: { notaId },
		select: { item: true },
	});
	const set = new Set(respondidos.map((r) => r.item));
	return INVENTARIO_ITEM_KEYS.filter((k) => !set.has(k));
}

/**
 * "Liberación 360" — the 15-point pre-delivery checklist. Deliberately WIDER than `nota:close`
 * (Admin/Gerente): the Operador at the counter is usually who walks around the vehicle, but
 * formally entregar-ing it stays with whoever already held that authority.
 *
 * Same delete-then-recreate shape as `inspeccionarNota`'s inventory, but the note's own verdict
 * (`unidadLiberada`) lives on `nota_servicio` — that is the single field `entregarNota` checks,
 * so the gate never has to re-derive it from 15 rows.
 */
export async function guardarLiberacion(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "nota:liberacion")) throw new ClienteError(403, "Sin permiso: nota:liberacion");

	const current = await getNota(input.id);
	if (current.estado === "cancelada" || current.estado === "entregada") {
		throw new ClienteError(409, `Una nota ${notaEstadoLabel(current.estado).toLowerCase()} ya no se libera.`);
	}

	const items = leerLiberacion(input.body);
	const unidadLiberada = input.body.unidadLiberada === true || input.body.unidadLiberada === "1";
	const observaciones = trim(input.body.observacionesLiberacion);

	const nota = await prisma.$transaction(async (tx) => {
		await tx.nota_liberacion.deleteMany({ where: { notaId: current.id } });
		if (items.length > 0) {
			await tx.nota_liberacion.createMany({ data: items.map((i) => ({ ...i, notaId: current.id })) });
		}

		const actualizada = await tx.nota_servicio.update({
			where: { id: current.id },
			data: {
				unidadLiberada,
				liberacionAt: new Date(),
				liberadaPorId: input.actor.id,
				observacionesLiberacion: observaciones,
			},
			include: INCLUDE,
		});

		await recordAudit(tx, {
			action: "nota.liberacion",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: notaLabel(actualizada),
			summary: `Checklist de liberación de la nota #${actualizada.folio}: ${unidadLiberada ? "liberada" : "NO liberada"}`,
			after: { unidadLiberada, items: items.length },
		});

		return actualizada;
	});

	return nota;
}

/** `respuesta_<item>` / `notas_<item>` — the flat shape a plain `<form>` posts and the JSON API mirrors. */
function leerLiberacion(body: Record<string, unknown>): { item: string; respuesta: string; notas: string | null }[] {
	const resultado: { item: string; respuesta: string; notas: string | null }[] = [];
	for (const item of LIBERACION_ITEM_KEYS) {
		if (!isLiberacionItem(item)) continue;
		const respuesta = body[`respuesta_${item}`];
		if (!isRespuestaLiberacion(respuesta)) continue;
		resultado.push({ item, respuesta, notas: trim(body[`notas_${item}`], 255, "La nota") });
	}
	return resultado;
}

// --- Estados ---------------------------------------------------------------------------------

export async function avanzarNota(input: { actor: Actor; id: string; estado: unknown }) {
	if (!can(input.actor.role, "nota:advance")) throw new ClienteError(403, "Sin permiso: nota:advance");

	const destino = input.estado;
	if (!isNotaEstado(destino)) throw new ClienteError(400, "Estado inválido");
	if (destino === "cancelada") {
		throw new ClienteError(400, "Para cancelar usa la acción de cancelar, que pide un motivo.");
	}
	if (destino === "entregada") {
		throw new ClienteError(400, "Para entregar usa la acción de entrega, que registra quién recibió.");
	}
	if (destino === "en_taller") {
		throw new ClienteError(400, "Para mandar a un taller usa la acción de transferir.");
	}

	const current = await getNota(input.id);

	// "Liberación 360": nada se marca lista para entrega sin el checklist de 15 puntos dicho
	// "liberada: sí" — no sólo al momento de entregar. Antes de esto, una nota podía llegar a
	// "lista" sin que nadie hubiera revisado la unidad.
	if (destino === "lista" && current.unidadLiberada !== true) {
		throw new ClienteError(
			409,
			"Completa el checklist de liberación antes de marcar la unidad como lista — falta marcar la unidad como liberada.",
		);
	}

	// Coming back from a partner shop is NOT a plain status change: somebody has to sign off on
	// the work first. Routing it through `recibirDeTaller` is what makes the QA step unavoidable
	// rather than optional — see the constraint `nota_transferencia_cerrada_qa_check`.
	if (current.estado === "en_taller") {
		throw new ClienteError(
			409,
			"La unidad está en un taller aliado. Usa la recepción con control de calidad para regresarla.",
		);
	}

	if (!puedeTransicionarNota(current.estado, destino)) {
		throw new ClienteError(
			409,
			`No se puede pasar de ${notaEstadoLabel(current.estado)} a ${notaEstadoLabel(destino)}.`,
		);
	}

	const nota = await prisma.$transaction(async (tx) => {
		const actualizada = await tx.nota_servicio.update({
			where: { id: current.id },
			data: { estado: destino as NotaEstado },
			include: INCLUDE,
		});

		await recordAudit(tx, {
			action: "nota.advance",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: notaLabel(actualizada),
			summary: `Nota #${actualizada.folio}: ${notaEstadoLabel(current.estado)} → ${notaEstadoLabel(destino)}`,
			before: { estado: current.estado },
			after: { estado: destino },
		});

		return actualizada;
	});

	// `notaEstadoClienteLabel` is the customer-safe vocabulary — `en_taller` reads "En proceso de
	// reparación" there, exactly so progress never discloses that somebody else has the vehicle.
	await avisarCliente(nota, {
		evento: destino === "lista" ? "cliente_unidad_lista" : "cliente_avance",
		titulo: destino === "lista" ? "Tu unidad está lista" : "Avance de tu servicio",
		cuerpo:
			destino === "lista"
				? `Ya puedes pasar por ella. Nota #${nota.folio}.`
				: `Nota #${nota.folio}: ${notaEstadoClienteLabel(destino)}.`,
	});

	return nota;
}

/**
 * Receive the unit back from a partner workshop, with quality control.
 *
 * This is the ONLY way out of `en_taller`. Estación 360 is who the customer holds responsible for
 * the repair — the partner shop is invisible to them — so accepting work back is a decision with
 * a name and a timestamp on it, not a status that flips because the truck showed up in the yard.
 *
 * The verdict and WHERE THE UNIT ENDS UP are two separate answers. A rejection defaults to leaving
 * it with the shop that owes the fix, but `destino: "retorno"` takes it back — that is what makes
 * "the work was bad, I'm sending it somewhere else" possible without approving work that was not
 * approved. Either way the unit is never released to the CUSTOMER on a bad repair.
 */
export async function recibirDeTaller(input: {
	actor: Actor;
	id: string;
	qaResultado: unknown;
	/** Only meaningful on a rejection; anything accepted always comes back. */
	destino?: unknown;
	qaNotas?: unknown;
	resultado?: unknown;
	kilometraje?: unknown;
}) {
	if (!can(input.actor.role, "nota:transfer")) throw new ClienteError(403, "Sin permiso: nota:transfer");

	if (!isQaResultado(input.qaResultado)) {
		throw new ClienteError(400, "Di si el trabajo se aprueba, se acepta con detalles o se rechaza");
	}
	// Bound to a local: the narrowing from the guard above does not survive into the transaction
	// closure, because TypeScript cannot know `input` is not mutated in between.
	const qaResultado = input.qaResultado;
	const qaNotas = trim(input.qaNotas);
	if (qaResultado === "rechazado" && !qaNotas) {
		throw new ClienteError(400, "Un rechazo tiene que decir qué salió mal; es lo que se le reclama al taller");
	}

	const current = await getNota(input.id);
	if (current.estado !== "en_taller") {
		throw new ClienteError(409, "Esta nota no está en ningún taller aliado.");
	}

	const abierta = await prisma.nota_transferencia.findFirst({
		where: { notaId: current.id, hasta: null },
		include: { taller: { select: { nombre: true } } },
	});
	if (!abierta) throw new ClienteError(409, "No hay una transferencia abierta que cerrar.");

	const kilometraje = int(input.kilometraje);
	const rechazado = qaResultado === "rechazado";
	// An accepted job always comes back, so `destino` only decides anything on a rejection. Left
	// unsaid it means rework, which is what this used to do unconditionally — old API callers keep
	// the behaviour they had.
	const destino = isQaDestino(input.destino) ? input.destino : qaDestinoPorDefecto(qaResultado);
	const sigueEnTaller = qaSigueEnTaller(qaResultado, destino);

	const nota = await prisma.$transaction(async (tx) => {
		const ahora = new Date();

		await tx.nota_transferencia.update({
			where: { id: abierta.id },
			data: {
				// Left for rework, the period stays open: the unit never physically came back, and a
				// closed transfer would say it did. Recovered, it closes like any other — carrying the
				// rejection as its verdict, which is what gets claimed back from the shop.
				hasta: sigueEnTaller ? null : ahora,
				resultado: trim(input.resultado) ?? abierta.resultado,
				qaResultado,
				qaNotas,
				qaAt: ahora,
				qaPorId: input.actor.id,
			},
		});

		// Shops often return a unit with more kilometres on it than it left with.
		if (kilometraje !== null) {
			await registrarKilometraje(tx, {
				actor: input.actor,
				unidadId: current.unidadId,
				kilometraje,
				origen: "nota",
				notaId: current.id,
				notas: `Regreso de ${abierta.taller.nombre}`,
			});
		}

		const actualizada = await tx.nota_servicio.update({
			where: { id: current.id },
			data: sigueEnTaller
				? {} // still `en_taller`, still theirs
				: { estado: "en_diagnostico", tallerActualId: null },
			include: INCLUDE,
		});

		// The QA verdict is part of the job's story, so it lands in the thread too — internal,
		// because the partner shop must never surface to the customer.
		await tx.nota_comentario.create({
			data: {
				id: randomUUID(),
				notaId: current.id,
				texto: `Control de calidad: ${qaResultadoLabel(qaResultado)}.${qaNotas ? ` ${qaNotas}` : ""}${
					rechazado
						? ` La unidad ${sigueEnTaller ? "se queda para retrabajo" : "regresa a Estación 360"}.`
						: ""
				}`,
				interno: true,
				autorId: input.actor.id,
				autorEmail: input.actor.email,
			},
		});

		await recordAudit(tx, {
			action: "nota.qa",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: notaLabel(actualizada),
			summary: rechazado
				? `Nota #${actualizada.folio}: trabajo RECHAZADO a ${abierta.taller.nombre} (${
						sigueEnTaller ? "se queda para retrabajo" : "unidad recuperada"
					}) — ${qaNotas}`
				: `Nota #${actualizada.folio}: recibida de ${abierta.taller.nombre} (${qaResultadoLabel(qaResultado)})`,
			before: { estado: current.estado, tallerActualId: current.tallerActualId },
			after: {
				estado: actualizada.estado,
				qaResultado,
				destino,
				taller: abierta.taller.nombre,
				kilometraje,
			},
		});

		return actualizada;
	});

	// Staff copy — it may name the shop, and on a rejection it has to.
	await avisarPersonal(nota, {
		evento: rechazado ? "nota_qa_rechazado" : "nota_taller_retorno",
		titulo: rechazado ? "Control de calidad rechazado" : "Regresó una unidad del taller aliado",
		cuerpo: rechazado
			? sigueEnTaller
				? `Nota #${nota.folio}: se le regresa a ${abierta.taller.nombre} para retrabajo. ${qaNotas}`
				: `Nota #${nota.folio}: rechazado el trabajo de ${abierta.taller.nombre} y la unidad ya está de vuelta con nosotros. ${qaNotas}`
			: `Nota #${nota.folio} de vuelta de ${abierta.taller.nombre} (${qaResultadoLabel(qaResultado)}).`,
		excepto: input.actor.id,
	});

	return nota;
}

/**
 * Everything that has happened to one vehicle: its service notes, every partner shop it has been
 * to, and every person who touched it — ours and the customer's.
 *
 * This is the unit's file. A truck that has been to the same shop three times for the same fault
 * is a fact you can only see when the history is in one place instead of spread across notes.
 *
 * Staff-only, like the rest of the panel: `notaParaCliente` is what a customer would ever see,
 * and it deliberately has none of this.
 */
export async function historialUnidad(unidadId: string) {
	const notas = await prisma.nota_servicio.findMany({
		where: { unidadId },
		orderBy: { recibidaAt: "desc" },
		include: {
			cliente: { select: { nombreCompleto: true } },
			recibidaPor: { select: { name: true } },
			entregadaAContacto: { select: { nombre: true } },
			transferencias: {
				orderBy: { desde: "desc" },
				include: {
					taller: { select: { id: true, nombre: true, telefono: true, especialidades: true } },
					enviadaPor: { select: { name: true } },
					qaPor: { select: { name: true } },
				},
			},
		},
	});

	// One row per partner shop, with what it actually did for this unit — the number that tells
	// you whether a shop keeps getting the same truck back.
	const porTaller = new Map<
		string,
		{
			id: string;
			nombre: string;
			telefono: string | null;
			especialidades: string | null;
			visitas: number;
			rechazos: number;
			ultima: string;
			motivos: string[];
		}
	>();

	// And one per person, so "who has handled this truck" is answerable without reading every note.
	const personas = new Map<string, { nombre: string; papel: string; veces: number }>();
	const sumarPersona = (nombre: string | null | undefined, papel: string) => {
		if (!nombre) return;
		const clave = `${papel}:${nombre}`;
		const previo = personas.get(clave);
		personas.set(clave, { nombre, papel, veces: (previo?.veces ?? 0) + 1 });
	};

	for (const nota of notas) {
		sumarPersona(nota.recibidaPor?.name, "Recibió la unidad");
		sumarPersona(nota.entregadaAContacto?.nombre, "Recogió la unidad");

		for (const t of nota.transferencias) {
			const previo = porTaller.get(t.tallerId);
			porTaller.set(t.tallerId, {
				id: t.taller.id,
				nombre: t.taller.nombre,
				telefono: t.taller.telefono,
				especialidades: t.taller.especialidades,
				visitas: (previo?.visitas ?? 0) + 1,
				rechazos: (previo?.rechazos ?? 0) + (t.qaResultado === "rechazado" ? 1 : 0),
				ultima: previo?.ultima ?? t.desde.toISOString(),
				motivos: [...(previo?.motivos ?? []), t.motivo].slice(0, 5),
			});
			sumarPersona(t.enviadaPor?.name, "Envió a taller");
			sumarPersona(t.qaPor?.name, "Revisó calidad");
		}
	}

	return {
		notas: notas.map((n) => ({
			id: n.id,
			folio: n.folio,
			estado: n.estado,
			estadoLabel: notaEstadoLabel(n.estado),
			recibidaAt: n.recibidaAt.toISOString(),
			entregadaAt: n.entregadaAt?.toISOString() ?? null,
			clienteNombre: n.cliente?.nombreCompleto ?? null,
			motivo: n.motivo,
			kilometraje: n.kilometraje,
			recibidaPor: n.recibidaPor?.name ?? null,
			entregadaA: n.entregadaAContacto?.nombre ?? null,
			talleres: n.transferencias.length,
		})),
		// Every transfer, flat and newest first — the taller history for this vehicle.
		transferencias: notas.flatMap((n) =>
			n.transferencias.map((t) => ({
				id: t.id,
				notaId: n.id,
				notaFolio: n.folio,
				tallerId: t.tallerId,
				tallerNombre: t.taller.nombre,
				motivo: t.motivo,
				desde: t.desde.toISOString(),
				hasta: t.hasta?.toISOString() ?? null,
				abierta: t.hasta === null,
				qaResultado: t.qaResultado,
				qaNotas: t.qaNotas,
				qaPor: t.qaPor?.name ?? null,
				enviadaPor: t.enviadaPor?.name ?? null,
			})),
		),
		talleres: [...porTaller.values()].sort((a, b) => b.visitas - a.visitas),
		personas: [...personas.values()].sort((a, b) => b.veces - a.veces),
		resumen: {
			notas: notas.length,
			abiertas: notas.filter((n) => NOTA_ESTADOS_ABIERTOS.includes(n.estado as never)).length,
			talleresDistintos: porTaller.size,
			rechazos: [...porTaller.values()].reduce((s, t) => s + t.rechazos, 0),
		},
	};
}

/** Transfers still waiting on a quality check. The list the shop actually works from. */
export async function pendientesDeQa() {
	const rows = await prisma.nota_transferencia.findMany({
		where: { hasta: null },
		orderBy: { desde: "asc" },
		include: {
			taller: { select: { nombre: true } },
			nota: { select: { id: true, folio: true, estado: true } },
		},
	});
	return rows.map((t) => ({
		transferenciaId: t.id,
		notaId: t.notaId,
		notaFolio: t.nota.folio,
		tallerNombre: t.taller.nombre,
		motivo: t.motivo,
		desde: t.desde.toISOString(),
		// A previously rejected job is still open AND already carries a verdict.
		rechazadaAntes: t.qaResultado === "rechazado",
		qaNotas: t.qaNotas,
	}));
}

/**
 * Send the vehicle out to a partner shop.
 *
 * Opens a transfer period and points `tallerActualId` at it, in one transaction — the same
 * denormalization discipline as `unidad.clienteId`. A partial unique index guarantees at most one
 * open transfer per note, so a vehicle can never be at two shops at once.
 */
export async function transferirNota(input: { actor: Actor; id: string; tallerId: unknown; motivo: unknown }) {
	if (!can(input.actor.role, "nota:transfer")) throw new ClienteError(403, "Sin permiso: nota:transfer");

	const motivo = trim(input.motivo, 500, "El motivo");
	if (!motivo) throw new ClienteError(400, "Di para qué se manda al taller");

	const tallerId = trim(input.tallerId);
	if (!tallerId) throw new ClienteError(400, "Elige el taller");

	const current = await getNota(input.id);

	// A unit cannot be handed from one partner shop to the next without checking the first one's
	// work — that is precisely the gap the QA step exists to close. Receive it back (with a
	// verdict) and then send it on.
	if (current.estado === "en_taller") {
		throw new ClienteError(
			409,
			"La unidad sigue en un taller aliado. Recíbela con control de calidad antes de mandarla a otro.",
		);
	}
	if (!puedeTransicionarNota(current.estado, "en_taller")) {
		throw new ClienteError(
			409,
			`Una nota ${notaEstadoLabel(current.estado).toLowerCase()} ya no se manda a taller.`,
		);
	}

	const taller = await prisma.taller.findUnique({
		where: { id: tallerId },
		select: { nombre: true, archivedAt: true, estado: true },
	});
	if (!taller) throw new ClienteError(404, "Taller no encontrado");
	if (taller.archivedAt) throw new ClienteError(409, "Ese taller está archivado.");
	// Certification is what the public /talleres registry is FOR. A shop that applied but has not
	// been reviewed must never end up holding a customer's vehicle just because it appears in a
	// dropdown — so the gate is here, on the write, not on which options got rendered.
	if (taller.estado !== TALLER_PUEDE_RECIBIR) {
		throw new ClienteError(
			409,
			`${taller.nombre} no está certificado como taller aliado. Apruébalo antes de mandarle una unidad.`,
		);
	}

	const nota = await prisma.$transaction(async (tx) => {
		const ahora = new Date();
		// Close whatever was open first — moving straight from one partner to another is a real
		// flow, and leaving the previous period open would trip the partial unique index.
		await tx.nota_transferencia.updateMany({
			where: { notaId: current.id, hasta: null },
			data: { hasta: ahora },
		});
		await tx.nota_transferencia.create({
			data: {
				id: randomUUID(),
				notaId: current.id,
				tallerId,
				motivo,
				desde: ahora,
				enviadaPorId: input.actor.id,
			},
		});

		const actualizada = await tx.nota_servicio.update({
			where: { id: current.id },
			data: { estado: "en_taller", tallerActualId: tallerId },
			include: INCLUDE,
		});

		await recordAudit(tx, {
			action: "nota.transfer",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: notaLabel(actualizada),
			summary: `Nota #${actualizada.folio} enviada a ${taller.nombre}: ${motivo}`,
			before: { estado: current.estado, tallerActualId: current.tallerActualId },
			after: { estado: "en_taller", tallerActualId: tallerId, motivo },
		});

		return actualizada;
	});

	return nota;
}

/** Record what the partner shop reported when the unit came back. */
export async function registrarResultadoTransferencia(input: {
	actor: Actor;
	id: string;
	transferenciaId: string;
	resultado: unknown;
}) {
	if (!can(input.actor.role, "nota:transfer")) throw new ClienteError(403, "Sin permiso: nota:transfer");

	const resultado = trim(input.resultado);
	if (!resultado) throw new ClienteError(400, "Escribe qué reportó el taller");

	const transferencia = await prisma.nota_transferencia.findUnique({
		where: { id: input.transferenciaId },
		select: { notaId: true },
	});
	if (!transferencia || transferencia.notaId !== input.id) {
		throw new ClienteError(404, "Transferencia no encontrada");
	}

	const nota = await getNota(input.id);
	await prisma.$transaction(async (tx) => {
		await tx.nota_transferencia.update({
			where: { id: input.transferenciaId },
			data: { resultado },
		});
		await recordAudit(tx, {
			action: "nota.return",
			actor: input.actor,
			entityId: nota.id,
			entityLabel: notaLabel(nota),
			summary: `Reporte del taller en la nota #${nota.folio}`,
			after: { resultado },
		});
	});

	return getNota(input.id);
}

/**
 * Hand the vehicle back.
 *
 * Who collected it is not free text: it must be the customer themselves (a persona can sign for
 * their own unit) or one of their contacts holding `entregador`. That is the same rule the cita's
 * handover person follows, and it is the whole reason those roles exist.
 */
export async function entregarNota(input: { actor: Actor; id: string; contactoId?: unknown; observaciones?: unknown }) {
	if (!can(input.actor.role, "nota:close")) throw new ClienteError(403, "Sin permiso: nota:close");

	const current = await getNota(input.id);
	if (!puedeTransicionarNota(current.estado, "entregada")) {
		throw new ClienteError(
			409,
			`Una nota ${notaEstadoLabel(current.estado).toLowerCase()} no se puede entregar. Márcala como lista primero.`,
		);
	}
	// "Liberación 360": nada sale del taller sin el checklist de 15 puntos dicho "liberada: sí".
	if (current.unidadLiberada !== true) {
		throw new ClienteError(
			409,
			"Completa el checklist de liberación antes de entregar — falta marcar la unidad como liberada.",
		);
	}

	const contactoId = trim(input.contactoId);
	if (contactoId) {
		const contacto = await prisma.cliente_contacto.findUnique({
			where: { id: contactoId },
			select: { clienteId: true, roles: true, nombre: true, archivedAt: true },
		});
		if (!contacto) throw new ClienteError(404, "Contacto no encontrado");
		if (contacto.clienteId !== current.clienteId) {
			throw new ClienteError(400, "Ese contacto pertenece a otro cliente");
		}
		if (contacto.archivedAt) throw new ClienteError(409, "Ese contacto está archivado.");
		if (!contacto.roles.includes("entregador")) {
			throw new ClienteError(
				400,
				`${contacto.nombre} no tiene el rol de Entregador. Agrégaselo en la ficha del cliente.`,
			);
		}
	} else if (current.cliente?.tipo === "organizacion") {
		// A company cannot physically sign for anything; somebody has to be named.
		throw new ClienteError(400, "Una organización no firma por sí misma: indica quién recibe la unidad.");
	}

	const nota = await prisma.$transaction(async (tx) => {
		const actualizada = await tx.nota_servicio.update({
			where: { id: current.id },
			data: {
				estado: "entregada",
				entregadaAt: new Date(),
				entregadaAContactoId: contactoId,
				observaciones: input.observaciones !== undefined ? trim(input.observaciones) : current.observaciones,
			},
			include: INCLUDE,
		});

		// The appointment, if there was one, is done too.
		if (current.citaId) {
			await tx.cita.updateMany({
				where: { id: current.citaId, estado: { in: ["confirmada", "en_proceso"] } },
				data: { estado: "completada" },
			});
		}

		await recordAudit(tx, {
			action: "nota.close",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: notaLabel(actualizada),
			summary: `Nota #${actualizada.folio} entregada a ${actualizada.entregadaAContacto?.nombre ?? actualizada.cliente?.nombreCompleto}`,
			before: { estado: current.estado },
			after: { estado: "entregada", entregadaAContactoId: contactoId },
		});

		return actualizada;
	});

	await avisarCliente(nota, {
		evento: "cliente_unidad_entregada",
		titulo: "Entregamos tu unidad",
		cuerpo: `Nota #${nota.folio} cerrada. Gracias por confiar en nosotros.`,
	});

	return nota;
}

export async function cancelarNota(input: { actor: Actor; id: string; motivo: unknown }) {
	if (!can(input.actor.role, "nota:cancel")) throw new ClienteError(403, "Sin permiso: nota:cancel");

	const motivo = trim(input.motivo, 255, "El motivo");
	if (!motivo) throw new ClienteError(400, "El motivo de la cancelación es obligatorio");

	const current = await getNota(input.id);
	if (!puedeTransicionarNota(current.estado, "cancelada")) {
		throw new ClienteError(409, `Una nota ${notaEstadoLabel(current.estado).toLowerCase()} ya no se cancela.`);
	}

	const nota = await prisma.$transaction(async (tx) => {
		// Closing an open transfer needs a verdict (nota_transferencia_cerrada_qa_check), and on a
		// cancelled job there is nothing to assess. `no_aplica` says exactly that instead of
		// recording a quality check that never happened.
		await tx.nota_transferencia.updateMany({
			where: { notaId: current.id, hasta: null },
			data: {
				hasta: new Date(),
				qaResultado: "no_aplica",
				qaAt: new Date(),
				qaPorId: input.actor.id,
				qaNotas: `Nota cancelada: ${motivo}`,
			},
		});
		const actualizada = await tx.nota_servicio.update({
			where: { id: current.id },
			data: { estado: "cancelada", canceladoMotivo: motivo, tallerActualId: null },
			include: INCLUDE,
		});
		await recordAudit(tx, {
			action: "nota.cancel",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: notaLabel(actualizada),
			summary: `Nota #${actualizada.folio} cancelada: ${motivo}`,
			before: { estado: current.estado },
			after: { estado: "cancelada", motivo },
		});
		return actualizada;
	});

	return nota;
}

// --- Comentarios -----------------------------------------------------------------------------

/**
 * Running commentary. `interno` defaults to true: the safe default is that a note stays inside
 * the shop, and sharing it with the customer is the deliberate act.
 */
export async function comentarNota(input: {
	actor: Actor;
	id: string;
	texto: unknown;
	interno?: unknown;
	/** Ids of evidence rows already uploaded and registered for THIS note. */
	adjuntos?: unknown;
}) {
	if (!can(input.actor.role, "nota:comment")) throw new ClienteError(403, "Sin permiso: nota:comment");

	// Attachment ids arrive as one repeated field from a plain form, or an array from the API.
	const adjuntos = [
		...new Set(
			(Array.isArray(input.adjuntos) ? input.adjuntos : [input.adjuntos]).flatMap((v) =>
				typeof v === "string" && v.trim() ? [v.trim()] : [],
			),
		),
	];

	const texto = trim(input.texto);
	// A voice note IS the comment. Demanding text beside it is asking somebody with greasy hands to
	// type what they just said — so a comment is empty only when nothing at all came with it.
	if (!texto && adjuntos.length === 0) throw new ClienteError(400, "El comentario no puede ir vacío");

	const nota = await getNota(input.id);
	let interno = input.interno === undefined ? true : input.interno === true || input.interno === "1";

	// A mechanic may comment, but never AT the customer. Writing to the customer belongs to
	// whoever owns that relationship — and `notaParaCliente` exists precisely because what reaches
	// them is a decision, not a side effect of somebody unchecking a box in the bay.
	//
	// Scope goes through `exigirNotaPropia` (and so through `alcanceDeTaller`), NOT through a
	// hand-rolled `mecanicoId` comparison: work is assigned to a taller now, so a mechanic reaches
	// a note by belonging to whoever is holding it. The old check would 404 every note a mechanic
	// can legitimately open — the exact drift that having one boundary function prevents.
	if (!can(input.actor.role, "nota:read")) {
		await exigirNotaPropia(input.actor, nota.id);
		interno = true;
	}

	// A comment marked visible to the customer IS customer-facing data, so the same rule applies:
	// the partner workshop never surfaces. This catches the honest slip — pasting "ya lo mandamos
	// a El Sahuaro" into the wrong box — which is the realistic way that name escapes.
	if (!interno && texto) {
		const mencionado = await tallerMencionado(texto);
		if (mencionado) {
			throw new ClienteError(
				400,
				`Ese comentario menciona a "${mencionado}" y es visible para el cliente. Los talleres aliados nunca se le comparten: márcalo como interno o quita el nombre.`,
			);
		}
	}

	const comentario = await prisma.$transaction(async (tx) => {
		const creado = await tx.nota_comentario.create({
			data: {
				id: randomUUID(),
				notaId: nota.id,
				texto: texto ?? "",
				interno,
				autorId: input.actor.id,
				autorEmail: input.actor.email,
			},
		});

		if (adjuntos.length > 0) {
			// **Scoped to this note and to unattached rows.** Without `notaId` in the WHERE, a caller
			// could staple another job's evidence onto their comment and read its description; without
			// `comentarioId: null`, they could steal a file off somebody else's comment. `updateMany`
			// silently skips whatever does not match, which is the behaviour we want — a stale id from
			// a double-submit is not worth failing the comment over.
			const { count } = await tx.nota_evidencia.updateMany({
				where: { id: { in: adjuntos }, notaId: nota.id, comentarioId: null },
				data: { comentarioId: creado.id },
			});
			if (count === 0 && !texto) {
				// Nothing attached and nothing said: the comment would be an empty row nobody can read.
				throw new ClienteError(400, "No se pudo adjuntar el archivo. Vuelve a intentarlo.");
			}
		}

		await recordAudit(tx, {
			action: "nota.comment",
			actor: input.actor,
			entityId: nota.id,
			entityLabel: notaLabel(nota),
			summary: `Comentario ${interno ? "interno" : "para el cliente"} en la nota #${nota.folio}${
				adjuntos.length > 0 ? ` con ${adjuntos.length} archivo(s)` : ""
			}`,
			after: { interno, longitud: texto?.length ?? 0, adjuntos: adjuntos.length },
		});
		return creado;
	});

	// Only a comment marked visible reaches the customer — and it got past `tallerMencionado`
	// above, which is what makes it safe to forward verbatim.
	if (!interno) {
		await avisarCliente(nota, {
			evento: "cliente_comentario",
			titulo: "Un mensaje del taller",
			cuerpo: texto ? texto.slice(0, 400) : "Te compartimos un archivo de tu servicio.",
		});
	}

	return comentario;
}

/**
 * A comment's attachments, in the one shape every screen renders.
 *
 * Three callers — the customer's tracking page, the staff detail screen and the mechanic's — so it
 * is extracted rather than written three times (Rule 5). The read URL is derived here and never
 * stored: a saved signed URL expires and rots into a broken image.
 */
const ADJUNTOS_SELECT = {
	id: true,
	tipo: true,
	nombre: true,
	contentType: true,
	bytes: true,
	descripcion: true,
	clave: true,
} as const;

type AdjuntoRow = {
	id: string;
	tipo: string;
	nombre: string;
	contentType: string;
	bytes: number | null;
	descripcion: string | null;
	clave: string;
};

const adjuntoPublico = (a: AdjuntoRow) => ({
	id: a.id,
	tipo: a.tipo,
	nombre: a.nombre,
	contentType: a.contentType,
	bytes: a.bytes,
	descripcion: a.descripcion,
	url: urlDeLectura(a.clave),
});

// --- Evidencia -------------------------------------------------------------------------------

/**
 * Sign an upload for this note.
 *
 * The object key is generated server-side — a caller-chosen key could overwrite another note's
 * evidence — and the content type is checked BEFORE anything is signed, so a signed URL is never
 * handed out for a file we would refuse to record.
 */
/**
 * A mechanic may only touch the note assigned to them.
 *
 * 404, not 403: a mechanic probing ids must not be able to confirm that somebody else's job
 * exists. Anyone holding `nota:read` (the counter) passes straight through.
 */
async function exigirNotaPropia(actor: Actor, notaId: string) {
	if (can(actor.role, "nota:read")) return;
	// Same `alcanceDeTaller` the read path uses: a partner shop's mechanic may write on a note
	// their workshop holds even though nobody assigned it to them by name.
	const fila = await prisma.nota_servicio.findFirst({
		where: { id: notaId, ...alcanceDeTaller(actor) },
		select: { id: true },
	});
	if (!fila) throw new ClienteError(404, "Nota no encontrada");
}

export async function firmarEvidencia(input: {
	actor: Actor;
	id: string;
	nombre: unknown;
	contentType: unknown;
	bytes?: unknown;
}) {
	if (!can(input.actor.role, "nota:evidencia")) throw new ClienteError(403, "Sin permiso: nota:evidencia");
	await exigirNotaPropia(input.actor, input.id);

	const nombre = trim(input.nombre, 255, "El nombre del archivo");
	if (!nombre) throw new ClienteError(400, "Falta el nombre del archivo");
	if (!esMimePermitido(input.contentType)) {
		throw new ClienteError(400, "Solo se aceptan imágenes, PDF, audio o video");
	}

	// The limit follows the CONTENT TYPE, not the caller's word for it: a clip of a noise needs
	// room a photo does not, and `tipoDeMime` is what decides which is which.
	const limite = limiteDeTipo(tipoDeMime(input.contentType));
	const bytes = int(input.bytes);
	if (bytes !== null && bytes > limite) {
		throw new ClienteError(413, `El archivo pasa de ${megas(limite)} MB`);
	}

	const nota = await getNota(input.id);
	const firma = firmarSubida({ notaId: nota.id, nombreOriginal: nombre });
	if (!firma) {
		throw new ClienteError(
			503,
			"El almacenamiento de fotos no está configurado todavía. Avisa a un administrador.",
		);
	}

	return firma;
}

/**
 * Record an upload that already landed in R2.
 *
 * The key must be one WE signed for THIS note — checked by prefix — so a client cannot register
 * an object belonging to another job, or a path outside the bucket's note area.
 */
export async function registrarEvidencia(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "nota:evidencia")) throw new ClienteError(403, "Sin permiso: nota:evidencia");
	await exigirNotaPropia(input.actor, input.id);

	const nota = await getNota(input.id);

	const clave = trim(input.body.clave, 500, "La clave");
	if (!clave) throw new ClienteError(400, "Falta la clave del archivo subido");
	if (!clave.startsWith(`notas/${nota.id}/`)) {
		throw new ClienteError(400, "Esa clave no corresponde a esta nota");
	}

	const categoria = input.body.categoria;
	if (!isFotoCategoria(categoria)) throw new ClienteError(400, "Categoría inválida");
	if (!esMimePermitido(input.body.contentType)) {
		throw new ClienteError(400, "Tipo de archivo no permitido");
	}

	const nombre = trim(input.body.nombre, 255, "El nombre") ?? "archivo";
	// The mime IS the classification. Taking `tipo` from the caller would let a video be labelled a
	// photo and rendered in an `<img>`, and a `documento` be rendered in a `<video>`.
	const tipo = tipoDeMime(String(input.body.contentType));

	const evidencia = await prisma.$transaction(async (tx) => {
		const creada = await tx.nota_evidencia.create({
			data: {
				id: randomUUID(),
				notaId: nota.id,
				tipo,
				categoria,
				clave,
				nombre,
				contentType: String(input.body.contentType),
				bytes: int(input.body.bytes),
				descripcion: trim(input.body.descripcion, 500, "La descripción"),
				subidaPorId: input.actor.id,
			},
		});
		await recordAudit(tx, {
			action: "nota.evidence",
			actor: input.actor,
			entityId: nota.id,
			entityLabel: notaLabel(nota),
			summary: `Evidencia adjuntada a la nota #${nota.folio} (${categoria})`,
			after: { categoria, tipo, nombre },
		});
		return creada;
	});

	return evidencia;
}

/** Remove evidence. The row goes first; R2 is best-effort, so a dead object never blocks the UI. */
export async function borrarEvidencia(input: { actor: Actor; id: string; evidenciaId: string }) {
	if (!can(input.actor.role, "nota:evidencia")) throw new ClienteError(403, "Sin permiso: nota:evidencia");
	await exigirNotaPropia(input.actor, input.id);

	const nota = await getNota(input.id);
	const evidencia = await prisma.nota_evidencia.findUnique({ where: { id: input.evidenciaId } });
	if (!evidencia || evidencia.notaId !== nota.id) throw new ClienteError(404, "Evidencia no encontrada");

	await prisma.$transaction(async (tx) => {
		await tx.nota_evidencia.delete({ where: { id: evidencia.id } });
		await recordAudit(tx, {
			action: "nota.evidence_delete",
			actor: input.actor,
			entityId: nota.id,
			entityLabel: notaLabel(nota),
			summary: `Evidencia eliminada de la nota #${nota.folio} (${evidencia.categoria})`,
			before: { categoria: evidencia.categoria, nombre: evidencia.nombre },
		});
	});

	// The row is already gone and the audit entry with it, so the user's action DID succeed — this
	// is not something to fail their request over. But a file left in the bucket with nothing
	// pointing at it is invisible forever unless somebody writes it down here.
	if (!(await borrarObjeto(evidencia.clave))) {
		console.error(`[huerfano] objeto no borrado en R2: ${evidencia.clave} (nota ${nota.id})`);
	}
	return { ok: true };
}

// ================================================================================================
// El taller mecánico
// ================================================================================================

/**
 * The notes assigned to ONE mechanic.
 *
 * Scoped by `mecanicoId` in the WHERE, never by filtering a full list afterwards: a mechanic holds
 * `nota:asignadas`, not `nota:read`, and the difference has to be a different query or it is not a
 * boundary at all.
 *
 * Returns `notaParaTaller`, which carries no money and no customer contact — a mechanic needs the
 * vehicle, the fault and the history, not what the shop charges for it.
 */
export async function misNotas(actor: Actor, opciones: { cerradas?: boolean } = {}) {
	const notas = await prisma.nota_servicio.findMany({
		where: {
			...alcanceDeTaller(actor),
			...(opciones.cerradas ? {} : { estado: { in: NOTA_ESTADOS_ABIERTOS } }),
		},
		orderBy: [{ trabajoTerminadoAt: "asc" }, { recibidaAt: "asc" }],
		take: 100,
		include: INCLUDE,
	});

	const ids = notas.map((n) => n.id);
	const solicitudes = ids.length
		? await prisma.solicitud_refaccion.groupBy({
				by: ["notaId", "estado"],
				where: { notaId: { in: ids } },
				_count: { _all: true },
			})
		: [];

	return notas.map((n) => ({
		...notaParaTaller(n),
		refaccionesPendientes: solicitudes.find((s) => s.notaId === n.id && s.estado === "pendiente")?._count._all ?? 0,
	}));
}

/**
 * The note as a MECHANIC may see it.
 *
 * No prices, no credit, no customer phone number: the mechanic's job is the vehicle. This is the
 * same reasoning as `notaParaCliente` — one mapper that decides what crosses a boundary, so the
 * rule lives in a single place instead of being re-remembered on every screen.
 *
 * The partner taller IS visible here: a mechanic being told the unit went out to hojalatería is
 * ordinary shop information. The rule is about the customer, not about staff.
 */
/**
 * Which notes a mechanic may see AT ALL — as a `where`, never as a filter after the fact.
 *
 * Two answers, and both are "work that is theirs":
 *
 * 1. **Assigned to them.** That is the whole scope for one of our own people.
 * 2. **Ever transferred to their partner workshop.** An outside shop's mechanic is not assigned
 *    the note by name — the vehicle was sent to their SHOP — and they still need it back after
 *    the job closes, because "what did we do to this truck last time" is the question that stops
 *    them from redoing it. Past transfers are included on purpose: the history is theirs too.
 *
 * Doing this as a query condition rather than a post-filter is the difference between a boundary
 * and a habit. A `take` limit applied before a post-filter would also silently drop rows.
 */
export function alcanceDeTaller(actor: Actor): Prisma.nota_servicioWhereInput {
	if (!actor.tallerId) return { mecanicoId: actor.id };
	return {
		OR: [{ mecanicoId: actor.id }, { transferencias: { some: { tallerId: actor.tallerId } } }],
	};
}

export const notaParaTaller = (n: NotaRow, motivoTaller: string | null = null) => ({
	id: n.id,
	folio: n.folio,
	estado: n.estado,
	estadoLabel: notaEstadoLabel(n.estado),
	// Why the job was sent to THEIR workshop, which is a different question from why the vehicle
	// came to Estación 360 in the first place. Both matter to somebody about to touch the truck:
	// the customer's complaint, and the specific piece of work we sourced out.
	motivoTaller,
	unidad: n.unidad ? `${n.unidad.marca} ${n.unidad.modelo}` : null,
	unidadDetalle: n.unidad
		? [n.unidad.anio, n.unidad.placas, n.unidad.numeroEconomico].filter(Boolean).join(" · ")
		: null,
	unidadId: n.unidadId,
	motivo: n.motivo,
	diagnostico: n.diagnostico,
	kilometraje: n.kilometraje,
	combustibleLabel: combustibleLabel(n.combustibleOctavos),
	condicion: n.condicion,
	inspeccionada: n.inspeccionAt !== null,
	recibidaAt: n.recibidaAt.toISOString(),
	tallerActualNombre: n.tallerActual?.nombre ?? null,
	trabajoTerminadoAt: n.trabajoTerminadoAt?.toISOString() ?? null,
	evidencias: n._count.evidencias,
});

/**
 * Read one note as a mechanic, with the ownership check built in.
 *
 * Anybody holding `nota:read` (the counter) passes through; a mechanic gets a 404 for a note that
 * is not theirs — **404, not 403**, so the id of somebody else's job cannot be confirmed by
 * probing.
 */
export async function getNotaDeTaller(actor: Actor, id: string) {
	// The scope is the WHERE, not a check on the row afterwards — same rule as `misNotas`, and the
	// reason it is the same helper: two spellings of one boundary drift.
	const nota = can(actor.role, "nota:read")
		? await prisma.nota_servicio.findUnique({ where: { id }, include: INCLUDE })
		: await prisma.nota_servicio.findFirst({
				where: { id, ...alcanceDeTaller(actor) },
				include: INCLUDE,
			});
	if (!nota) throw new ClienteError(404, "Nota no encontrada");

	const [evidencias, solicitudes, comentarios, transferencia] = await Promise.all([
		prisma.nota_evidencia.findMany({
			where: { notaId: nota.id },
			orderBy: { createdAt: "desc" },
			take: 40,
		}),
		listSolicitudes({ notaId: nota.id }),
		prisma.nota_comentario.findMany({
			where: { notaId: nota.id },
			orderBy: { createdAt: "desc" },
			take: 30,
			include: { adjuntos: { select: ADJUNTOS_SELECT } },
		}),
		// What WE asked their shop to do. Only for an outside mechanic: one of ours has no
		// workshop, and there is no "their" transfer to read.
		actor.tallerId
			? prisma.nota_transferencia.findFirst({
					where: { notaId: nota.id, tallerId: actor.tallerId },
					orderBy: { desde: "desc" },
					select: { motivo: true },
				})
			: null,
	]);

	return {
		nota: notaParaTaller(nota, transferencia?.motivo ?? null),
		evidencias: evidencias.map((e) => ({
			id: e.id,
			categoria: e.categoria,
			nombre: e.nombre,
			descripcion: e.descripcion,
			url: urlDeLectura(e.clave),
			createdAt: e.createdAt.toISOString(),
		})),
		solicitudes,
		comentarios: comentarios.map((c) => ({
			id: c.id,
			texto: c.texto,
			interno: c.interno,
			autorEmail: c.autorEmail,
			createdAt: c.createdAt.toISOString(),
			adjuntos: c.adjuntos.map(adjuntoPublico),
		})),
	};
}

/** Hand a job to a mechanic. Null takes it off them. */
export async function asignarMecanico(input: { actor: Actor; id: string; mecanicoId: unknown }) {
	if (!can(input.actor.role, "nota:asignar-mecanico")) {
		throw new ClienteError(403, "Sin permiso: nota:asignar-mecanico");
	}

	const current = await getNota(input.id);
	if (current.estado === "entregada" || current.estado === "cancelada") {
		throw new ClienteError(409, `Una nota ${notaEstadoLabel(current.estado).toLowerCase()} ya no se asigna.`);
	}

	const mecanicoId = trim(input.mecanicoId);
	if (mecanicoId) {
		const mecanico = await prisma.user.findUnique({
			where: { id: mecanicoId },
			select: { id: true, name: true, role: true, banned: true },
		});
		if (!mecanico) throw new ClienteError(404, "Ese usuario no existe");
		if (mecanico.banned) throw new ClienteError(409, "Esa cuenta está bloqueada.");
		// Anybody who can be handed a job is anybody who can open it. Checking the permission
		// rather than `role === 'taller'` is what keeps this from breaking the day an Operador
		// starts turning wrenches.
		if (!can(mecanico.role, "nota:asignadas")) {
			throw new ClienteError(400, "A esa persona no se le pueden asignar unidades.");
		}
	}
	if (mecanicoId === current.mecanicoId) throw new ClienteError(409, "La nota ya está así asignada.");

	const nota = await prisma.$transaction(async (tx) => {
		const actualizada = await tx.nota_servicio.update({
			where: { id: current.id },
			// Re-assigning restarts the clock: the new mechanic has not finished anything yet.
			data: { mecanicoId, trabajoTerminadoAt: null },
			include: INCLUDE,
		});

		await recordAudit(tx, {
			action: "nota.mecanico",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: notaLabel(actualizada),
			summary: mecanicoId
				? `Nota #${actualizada.folio} asignada a ${actualizada.mecanico?.name ?? mecanicoId}`
				: `Nota #${actualizada.folio} sin mecánico`,
			before: { mecanicoId: current.mecanicoId },
			after: { mecanicoId },
		});

		return actualizada;
	});

	if (mecanicoId) {
		await notificar({
			evento: "nota_asignada",
			destino: { userId: mecanicoId },
			titulo: "Te asignaron una unidad",
			cuerpo: `Nota #${nota.folio} · ${nota.unidad?.marca} ${nota.unidad?.modelo} — ${nota.motivo}`,
			url: `/panel/taller/${nota.id}`,
			entidad: "nota",
			entidadId: nota.id,
			excepto: input.actor.id,
		});
	}

	return nota;
}

/**
 * The mechanic writes what they found, and says when they are done.
 *
 * `trabajoTerminadoAt` is deliberately NOT a note estado. "The work is finished" and "the car can
 * be handed to the customer" are two different facts owned by two different people — collapsing
 * them is how a vehicle gets promised before anybody checked it.
 */
export async function capturarDiagnostico(input: {
	actor: Actor;
	id: string;
	diagnostico?: unknown;
	terminado?: unknown;
}) {
	if (!can(input.actor.role, "nota:diagnostico")) throw new ClienteError(403, "Sin permiso: nota:diagnostico");

	const current = await getNota(input.id);
	if (!can(input.actor.role, "nota:read") && current.mecanicoId !== input.actor.id) {
		throw new ClienteError(404, "Nota no encontrada");
	}
	if (current.estado === "entregada" || current.estado === "cancelada") {
		throw new ClienteError(409, `Una nota ${notaEstadoLabel(current.estado).toLowerCase()} ya no se edita.`);
	}

	const diagnostico = input.diagnostico === undefined ? current.diagnostico : trim(input.diagnostico);
	const marcaTerminado = input.terminado === true || input.terminado === "1";
	const desmarca = input.terminado === false || input.terminado === "0";

	if (marcaTerminado && !diagnostico) {
		throw new ClienteError(400, "Antes de cerrar tu trabajo escribe qué le hiciste a la unidad.");
	}

	const yaEstaba = current.trabajoTerminadoAt !== null;
	const nota = await prisma.$transaction(async (tx) => {
		const actualizada = await tx.nota_servicio.update({
			where: { id: current.id },
			data: {
				diagnostico,
				...(marcaTerminado ? { trabajoTerminadoAt: current.trabajoTerminadoAt ?? new Date() } : {}),
				...(desmarca ? { trabajoTerminadoAt: null } : {}),
			},
			include: INCLUDE,
		});

		await recordAudit(tx, {
			action: marcaTerminado && !yaEstaba ? "nota.trabajo" : "nota.diagnostico",
			actor: input.actor,
			entityId: actualizada.id,
			entityLabel: notaLabel(actualizada),
			summary:
				marcaTerminado && !yaEstaba
					? `Trabajo terminado en la nota #${actualizada.folio}`
					: `Diagnóstico capturado en la nota #${actualizada.folio}`,
			before: { diagnostico: current.diagnostico, terminado: yaEstaba },
			after: { diagnostico, terminado: actualizada.trabajoTerminadoAt !== null },
		});

		return actualizada;
	});

	// Only on the transition, not on every save of the same note.
	if (marcaTerminado && !yaEstaba) {
		await notificar({
			evento: "trabajo_terminado",
			destino: { difusion: true },
			titulo: "Trabajo terminado",
			cuerpo: `Nota #${nota.folio} · ${nota.unidad?.marca} ${nota.unidad?.modelo} — ${input.actor.name}`,
			url: `/panel/notas/${nota.id}`,
			entidad: "nota",
			entidadId: nota.id,
			excepto: input.actor.id,
		});
	}

	return nota;
}

/** Everyone a job can be handed to, for the picker. */
export async function mecanicosDisponibles() {
	const filas = await prisma.user.findMany({
		where: { role: "taller", NOT: { banned: true } },
		orderBy: { name: "asc" },
		select: { id: true, name: true, email: true },
	});
	return filas;
}
