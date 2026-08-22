/**
 * Purchase-side vendors — a new concept in this schema. Keyed by RFC, since that's the one
 * identifier that survives a supplier renaming itself or trading under a different name on
 * different invoices. "Track purchases" is answered by `listComprasDeProveedor`, which just
 * lists `inventario_entrada` rows by `proveedorId` — that table is already shaped like a
 * purchase header (folio, cfdi fields, total), so no separate purchase ledger was added.
 */

import { randomUUID } from "node:crypto";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import type { Actor } from "./guard";

const rfcNormalizado = (v: unknown): string | null => {
	const t = trim(v, 13);
	return t ? t.toUpperCase() : null;
};

/** Internal helper — no permission check, called from inside already-gated flows (e.g. a CFDI import). */
export async function buscarProveedorPorRfc(rfc: string) {
	return prisma.proveedor.findUnique({ where: { rfc: rfc.toUpperCase() } });
}

/**
 * Find-or-create by RFC. Used both from the provider admin screen and, unattended, whenever a
 * CFDI import names a supplier RFC the shop hasn't seen before — a purchase should never fail
 * just because nobody visited /panel/proveedores first.
 */
export async function resolverProveedorPorCfdi(rfc: string, nombre: string): Promise<string> {
	const existente = await buscarProveedorPorRfc(rfc);
	if (existente) return existente.id;

	const creado = await prisma.proveedor.create({
		data: { id: randomUUID(), rfc: rfc.toUpperCase(), nombre: trim(nombre, 200) ?? rfc.toUpperCase() },
	});
	return creado.id;
}

export async function crearProveedor(input: {
	actor: Actor;
	body: { rfc: unknown; nombre: unknown; contacto?: unknown; telefono?: unknown; email?: unknown };
}) {
	if (!can(input.actor.role, "proveedor:manage")) throw new ClienteError(403, "Sin permiso: proveedor:manage");

	const rfc = rfcNormalizado(input.body.rfc);
	if (!rfc) throw new ClienteError(400, "El RFC es obligatorio");
	const nombre = trim(input.body.nombre, 200, "El nombre");
	if (!nombre) throw new ClienteError(400, "El nombre es obligatorio");

	const repetido = await buscarProveedorPorRfc(rfc);
	if (repetido) throw new ClienteError(409, `Ya existe un proveedor con RFC ${rfc} (${repetido.nombre}).`);

	const proveedor = await prisma.proveedor.create({
		data: {
			id: randomUUID(),
			rfc,
			nombre,
			contacto: trim(input.body.contacto, 120),
			telefono: trim(input.body.telefono, 32),
			email: trim(input.body.email, 160),
		},
	});
	await recordAudit(prisma, {
		action: "proveedor.create",
		actor: input.actor,
		entityId: proveedor.id,
		entityLabel: proveedor.nombre,
		summary: `Proveedor "${proveedor.nombre}" (${proveedor.rfc}) creado`,
	});
	return proveedor;
}

/** RFC is the identity key — not editable here. Everything else about the vendor is. */
export async function editarProveedor(input: {
	actor: Actor;
	id: string;
	body: { nombre: unknown; contacto?: unknown; telefono?: unknown; email?: unknown };
}) {
	if (!can(input.actor.role, "proveedor:manage")) throw new ClienteError(403, "Sin permiso: proveedor:manage");

	const nombre = trim(input.body.nombre, 200, "El nombre");
	if (!nombre) throw new ClienteError(400, "El nombre es obligatorio");

	const actual = await getProveedor(input.id);
	const actualizado = await prisma.proveedor.update({
		where: { id: input.id },
		data: {
			nombre,
			contacto: trim(input.body.contacto, 120),
			telefono: trim(input.body.telefono, 32),
			email: trim(input.body.email, 160),
		},
	});
	await recordAudit(prisma, {
		action: "proveedor.editar",
		actor: input.actor,
		entityId: actualizado.id,
		entityLabel: actualizado.nombre,
		summary: `Proveedor "${actual.nombre}" actualizado`,
		before: { nombre: actual.nombre, contacto: actual.contacto },
		after: { nombre: actualizado.nombre, contacto: actualizado.contacto },
	});
	return actualizado;
}

export async function listProveedores(query: { q?: string | null } = {}) {
	const q = query.q?.trim();
	return prisma.proveedor.findMany({
		where: {
			archivedAt: null,
			...(q ? { OR: [{ nombre: { contains: q, mode: "insensitive" } }, { rfc: { contains: q.toUpperCase() } }] } : {}),
		},
		orderBy: { nombre: "asc" },
	});
}

export async function getProveedor(id: string) {
	const proveedor = await prisma.proveedor.findUnique({
		where: { id },
		include: { talleres: { include: { taller: { select: { id: true, nombre: true } } } } },
	});
	if (!proveedor) throw new ClienteError(404, "Proveedor no encontrado");
	return proveedor;
}

/** Every `inventario_entrada` this provider has been linked to — the purchase history. */
export async function listComprasDeProveedor(proveedorId: string) {
	const filas = await prisma.inventario_entrada.findMany({
		where: { proveedorId },
		orderBy: { recibidaAt: "desc" },
		select: { id: true, folio: true, cfdiTotal: true, cfdiFecha: true, recibidaAt: true, notas: true },
	});
	// Explicit mapper — a Prisma row (Decimal, Date) never crosses the load-function boundary raw.
	return filas.map((f) => ({
		id: f.id,
		folio: f.folio,
		cfdiTotal: f.cfdiTotal !== null ? f.cfdiTotal.toFixed(2) : null,
		cfdiFecha: f.cfdiFecha?.toISOString() ?? null,
		recibidaAt: f.recibidaAt.toISOString(),
		notas: f.notas,
	}));
}

export async function asignarTaller(input: { actor: Actor; proveedorId: string; tallerId: string }) {
	if (!can(input.actor.role, "proveedor:manage")) throw new ClienteError(403, "Sin permiso: proveedor:manage");
	await prisma.proveedor_taller.upsert({
		where: { proveedorId_tallerId: { proveedorId: input.proveedorId, tallerId: input.tallerId } },
		create: { proveedorId: input.proveedorId, tallerId: input.tallerId },
		update: {},
	});
}

export async function quitarTaller(input: { actor: Actor; proveedorId: string; tallerId: string }) {
	if (!can(input.actor.role, "proveedor:manage")) throw new ClienteError(403, "Sin permiso: proveedor:manage");
	await prisma.proveedor_taller.deleteMany({
		where: { proveedorId: input.proveedorId, tallerId: input.tallerId },
	});
}
