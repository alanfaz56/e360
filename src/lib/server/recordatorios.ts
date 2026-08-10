import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { enZona, hoy } from "$lib/agenda";
import { RECORDATORIO_TIPO_DEFAULT, isRecordatorioTipo, recordatorioTipoLabel } from "$lib/recordatorios";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import { getUnidad, unidadLabel } from "./unidades";
import { pageMeta, parsePageParams, skipFor, type PageParams } from "./paginate";
import type { Actor } from "./guard";

/**
 * Manual follow-ups: "call this customer on this date about this vehicle." Staff-created only —
 * there is no data on service intervals to compute one automatically, and no cron/scheduler in
 * this app to fire it at the right moment anyway.
 *
 * `vencido` is never stored: it is `!hecho && fecha < hoy()`, computed at read time exactly like
 * `motivoVencida` on `cita` — nothing to sweep, nothing to go stale.
 */

type RecordatorioRow = {
	id: string;
	unidadId: string;
	clienteId: string;
	notaId: string | null;
	citaId: string | null;
	motivo: string;
	fecha: Date;
	tipo: string;
	hecho: boolean;
	hechoAt: Date | null;
	createdAt: Date;
	unidad: { marca: string; modelo: string; placas: string | null; numeroEconomico: string | null };
	cliente: { nombreCompleto: string };
	creadoPor: { name: string } | null;
	hechoPor: { name: string } | null;
};

const HOY = () => enZona(hoy());

export const publicRecordatorio = (r: RecordatorioRow) => ({
	id: r.id,
	unidadId: r.unidadId,
	unidadEtiqueta: unidadLabel(r.unidad),
	clienteId: r.clienteId,
	clienteNombre: r.cliente.nombreCompleto,
	notaId: r.notaId,
	citaId: r.citaId,
	motivo: r.motivo,
	fecha: r.fecha.toISOString().slice(0, 10),
	tipo: r.tipo,
	tipoLabel: recordatorioTipoLabel(r.tipo),
	hecho: r.hecho,
	hechoAt: r.hechoAt?.toISOString() ?? null,
	hechoPorNombre: r.hechoPor?.name ?? null,
	creadoPorNombre: r.creadoPor?.name ?? null,
	createdAt: r.createdAt.toISOString(),
	vencido: !r.hecho && r.fecha < HOY(),
});

const INCLUDE = {
	unidad: { select: { marca: true, modelo: true, placas: true, numeroEconomico: true } },
	cliente: { select: { nombreCompleto: true } },
	creadoPor: { select: { name: true } },
	hechoPor: { select: { name: true } },
} satisfies Prisma.recordatorioInclude;

export type RecordatorioQuery = {
	vencidos?: boolean;
	hecho?: boolean;
	unidadId?: string | null;
	clienteId?: string | null;
} & Partial<PageParams>;

export function parseRecordatorioQuery(params: URLSearchParams): RecordatorioQuery {
	return {
		vencidos: params.get("vencidos") === "1",
		hecho: params.get("hecho") === "1",
		unidadId: params.get("unidadId"),
		clienteId: params.get("clienteId"),
		...parsePageParams(params),
	};
}

export async function listRecordatorios(query: RecordatorioQuery) {
	const paging = { page: query.page ?? 1, perPage: query.perPage ?? 25 };

	const where: Prisma.recordatorioWhereInput = {
		...(query.unidadId ? { unidadId: query.unidadId } : {}),
		...(query.clienteId ? { clienteId: query.clienteId } : {}),
		...(query.hecho ? { hecho: true } : { hecho: false }),
		...(query.vencidos ? { hecho: false, fecha: { lt: HOY() } } : {}),
	};

	const [total, rows] = await Promise.all([
		prisma.recordatorio.count({ where }),
		prisma.recordatorio.findMany({
			where,
			orderBy: { fecha: "asc" },
			skip: skipFor(paging),
			take: paging.perPage,
			include: INCLUDE,
		}),
	]);

	return { recordatorios: rows.map(publicRecordatorio), ...pageMeta(total, paging) };
}

/** Everything due in a date range, for the agenda's "Recordar" strip. Never `hecho`. */
export async function recordatoriosEnRango(desde: string, hasta: string) {
	const rows = await prisma.recordatorio.findMany({
		where: { hecho: false, fecha: { gte: enZona(desde), lte: enZona(hasta) } },
		orderBy: { fecha: "asc" },
		include: INCLUDE,
	});
	return rows.map(publicRecordatorio);
}

export async function crearRecordatorio(input: {
	actor: Actor;
	unidadId: string;
	body: { motivo: unknown; fecha: unknown; notaId?: unknown; citaId?: unknown; tipo?: unknown };
}) {
	if (!can(input.actor.role, "recordatorio:manage")) {
		throw new ClienteError(403, "Sin permiso: recordatorio:manage");
	}

	const unidad = await getUnidad(input.unidadId);
	const motivo = trim(input.body.motivo, 500, "El motivo");
	if (!motivo) throw new ClienteError(400, "El motivo es obligatorio");
	const fechaTexto = trim(input.body.fecha);
	if (!fechaTexto || Number.isNaN(new Date(fechaTexto).getTime())) {
		throw new ClienteError(400, "La fecha es obligatoria");
	}
	const notaId = trim(input.body.notaId);
	const citaId = trim(input.body.citaId);
	const tipo = isRecordatorioTipo(input.body.tipo) ? input.body.tipo : RECORDATORIO_TIPO_DEFAULT;

	const recordatorio = await prisma.recordatorio.create({
		data: {
			id: randomUUID(),
			unidadId: unidad.id,
			clienteId: unidad.clienteId,
			notaId,
			citaId,
			motivo,
			fecha: enZona(fechaTexto),
			tipo,
			creadoPorId: input.actor.id,
		},
		include: INCLUDE,
	});

	await recordAudit(prisma, {
		action: "recordatorio.create",
		actor: input.actor,
		entityId: recordatorio.id,
		entityLabel: `${unidadLabel(unidad)} · ${fechaTexto}`,
		summary: `Recordatorio para ${unidadLabel(unidad)} el ${fechaTexto}: ${motivo}`,
		after: { unidadId: unidad.id, fecha: fechaTexto, motivo, tipo },
	});

	return recordatorio;
}

async function getRecordatorio(id: string) {
	const recordatorio = await prisma.recordatorio.findUnique({ where: { id }, include: INCLUDE });
	if (!recordatorio) throw new ClienteError(404, "Recordatorio no encontrado");
	return recordatorio;
}

/** Reversible: `hecho: false` un-marks one done by mistake. */
export async function marcarRecordatorio(input: { actor: Actor; id: string; hecho: boolean }) {
	if (!can(input.actor.role, "recordatorio:manage")) {
		throw new ClienteError(403, "Sin permiso: recordatorio:manage");
	}

	const current = await getRecordatorio(input.id);

	const actualizado = await prisma.recordatorio.update({
		where: { id: current.id },
		data: input.hecho
			? { hecho: true, hechoAt: new Date(), hechoPorId: input.actor.id }
			: { hecho: false, hechoAt: null, hechoPorId: null },
		include: INCLUDE,
	});

	await recordAudit(prisma, {
		action: "recordatorio.hecho",
		actor: input.actor,
		entityId: actualizado.id,
		entityLabel: `${unidadLabel(actualizado.unidad)} · ${current.motivo}`,
		summary: `Recordatorio ${input.hecho ? "marcado" : "reabierto"}: ${current.motivo}`,
		before: { hecho: current.hecho },
		after: { hecho: input.hecho },
	});

	return actualizado;
}
