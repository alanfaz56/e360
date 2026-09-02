/**
 * The shop's own subscription to Estación 360 — separate from `comercial.ts`, which is the shop
 * billing ITS customers. This is the shop paying the deployment's owner (`esDueno`).
 *
 * Cycle status is fully derived from today's date, the latest `pago_app_ciclo` row, and an
 * optional owner-set extension — no scheduled job creates or updates anything. A month with no
 * uploaded evidence simply has no row; "no row" already means "not paid".
 */

import { randomUUID } from "node:crypto";
import prisma from "$lib/prisma";
import { centavos, pesos } from "$lib/comercial";
import { can } from "$lib/roles";
import { esMimePermitido, limiteDeTipo, megas, tipoDeMime } from "$lib/notas";
import { claveDeCiclo, estadoCiclo, inicioDeMes, vencimientoEfectivo, vencimientoLabel, type EstadoCiclo } from "$lib/facturacion-app-ciclo";
import { valorAjuste } from "./ajustes";
import { firmarSubida, urlDeLectura, type SubidaFirmada } from "./r2";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import { esDueno, type Actor } from "./guard";

export type { EstadoCiclo } from "$lib/facturacion-app-ciclo";

const int = (v: unknown): number | null => {
	if (typeof v === "number" && Number.isInteger(v)) return v;
	if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
	return null;
};

export type FacturacionAppEstado = { estado: EstadoCiclo; vencimientoLabel: string };

/**
 * What the panel layout and the warning modal both call. One read of the latest payment row, one
 * read of the extension setting, one pure decision. `esDueno` short-circuits before either read —
 * the owner reaches their own product regardless of whether their client has paid.
 */
export async function estadoFacturacionApp(actor: Actor, hoy = new Date()): Promise<FacturacionAppEstado> {
	if (esDueno(actor)) {
		return { estado: "al_corriente", vencimientoLabel: vencimientoLabel(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 15))) };
	}
	const [ultimo, plazoExtendido] = await Promise.all([
		prisma.pago_app_ciclo.findFirst({ orderBy: { ciclo: "desc" }, select: { ciclo: true } }),
		valorAjuste("facturacion_app.plazo_extendido"),
	]);
	const vencimiento = vencimientoEfectivo(hoy, plazoExtendido || null);
	return { estado: estadoCiclo(hoy, ultimo?.ciclo ?? null, vencimiento), vencimientoLabel: vencimientoLabel(vencimiento) };
}

/** The configured monthly amount, in cents. 0n if never set — caller/UI should say "not configured". */
export async function montoMensualCentavos(): Promise<bigint> {
	const texto = await valorAjuste("facturacion_app.monto_mensual");
	return centavos(texto) ?? 0n;
}

/** Sign an upload for THIS month's evidence. Same validation `firmarEvidencia` applies to notas. */
export function firmarSubidaPagoApp(input: { actor: Actor; nombre: unknown; contentType: unknown; bytes?: unknown }): SubidaFirmada {
	if (!can(input.actor.role, "pago_app:upload")) throw new ClienteError(403, "Sin permiso: pago_app:upload");

	const nombre = trim(input.nombre, 255, "El nombre del archivo");
	if (!nombre) throw new ClienteError(400, "Falta el nombre del archivo");
	if (!esMimePermitido(input.contentType)) {
		throw new ClienteError(400, "Solo se aceptan imágenes, PDF, audio o video");
	}

	const limite = limiteDeTipo(tipoDeMime(input.contentType));
	const bytes = int(input.bytes);
	if (bytes !== null && bytes > limite) {
		throw new ClienteError(413, `El archivo pasa de ${megas(limite)} MB`);
	}

	const firma = firmarSubida({ carpeta: `facturacion-app/${claveDeCiclo(new Date())}`, nombreOriginal: nombre });
	if (!firma) {
		throw new ClienteError(503, "El almacenamiento de archivos no está configurado todavía. Avisa a un administrador.");
	}
	return firma;
}

/** The current cycle's payment row, if any — for the upload screen to show "already paid" state. */
export async function pagoDelCicloActual() {
	return prisma.pago_app_ciclo.findUnique({
		where: { ciclo: inicioDeMes(new Date()) },
		select: { nombre: true, createdAt: true, montoCentavos: true },
	});
}

/**
 * Every cycle paid so far, newest first, with a link to the comprobante — the owner's ledger.
 * Owner-only: this is the one thing on `/panel/facturacion-app` a non-owner never needs, since a
 * Admin/Gerente already sees the current month's own state without a history view.
 */
export async function listPagosApp(actor: Actor) {
	if (!esDueno(actor)) throw new ClienteError(403, "Solo el dueño del sistema puede ver el historial de pagos.");

	const filas = await prisma.pago_app_ciclo.findMany({
		orderBy: { ciclo: "desc" },
		include: { subidaPor: { select: { name: true, email: true } } },
	});

	return filas.map((f) => ({
		id: f.id,
		cicloLabel: f.ciclo.toLocaleDateString("es-MX", { year: "numeric", month: "long", timeZone: "UTC" }),
		montoFormateado: pesos(f.montoCentavos),
		nombre: f.nombre,
		// Derived at read time, same reasoning as every other evidence link in the app — a stored
		// signed URL would expire and rot into a broken link on a page meant to stay useful forever.
		url: urlDeLectura(f.clave),
		subidoPor: f.subidaPor.name,
		createdAt: f.createdAt.toISOString(),
	}));
}

/**
 * Register the uploaded evidence for the CURRENT month. Auto-approves (v1): the moment this row
 * exists, `estadoFacturacionApp` reads `al_corriente` for the rest of the month.
 */
export async function registrarPagoApp(input: { actor: Actor; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "pago_app:upload")) throw new ClienteError(403, "Sin permiso: pago_app:upload");

	const cicloKey = claveDeCiclo(new Date());
	const clave = trim(input.body.clave, 500, "La clave");
	if (!clave) throw new ClienteError(400, "Falta la clave del archivo subido");
	if (!clave.startsWith(`facturacion-app/${cicloKey}/`)) {
		throw new ClienteError(400, "Esa clave no corresponde al ciclo actual");
	}
	if (!esMimePermitido(input.body.contentType)) {
		throw new ClienteError(400, "Solo se aceptan imágenes, PDF, audio o video");
	}

	const monto = await montoMensualCentavos();
	const ciclo = inicioDeMes(new Date());
	const datosComunes = {
		clave,
		nombre: trim(input.body.nombre, 255, "El nombre") ?? "comprobante",
		contentType: String(input.body.contentType),
		bytes: int(input.body.bytes),
		subidaPorId: input.actor.id,
	};

	const fila = await prisma.$transaction(async (tx) => {
		// Re-uploading within the same month REPLACES the evidence rather than creating a second row
		// — the unique constraint on `ciclo` means a second attempt is legitimately "the same bill".
		const creada = await tx.pago_app_ciclo.upsert({
			where: { ciclo },
			create: { id: randomUUID(), ciclo, montoCentavos: monto, ...datosComunes },
			update: datosComunes,
		});
		await recordAudit(tx, {
			action: "pago_app.upload",
			actor: input.actor,
			entityId: creada.id,
			entityLabel: `Pago de la app — ${cicloKey}`,
			summary: `Comprobante de pago subido para ${cicloKey} (${pesos(monto)})`,
			after: { ciclo: cicloKey, monto: pesos(monto), nombre: creada.nombre },
		});
		return creada;
	});

	return fila;
}
