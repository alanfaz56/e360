import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { limpiarTelefono } from "$lib/empresa";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import type { Actor } from "./guard";

/**
 * Estación 360's own contact info. Singleton row, fixed id — there is exactly one shop.
 *
 * Deliberately separate from `ajuste`/`AJUSTES`: that catalogue is gated by `requireDueno`
 * (Admin AND on `OWNER_EMAILS`) because it holds PAC/billing secrets. A phone number has to be
 * BOTH publicly readable (the public site links to it with no session at all) and editable by any
 * shop Admin/Gerente — neither of which `requireDueno` allows. Two different trust levels, two
 * tables, so the generic ajuste write path is never reachable from a lower-privilege caller.
 */
const ID = "principal";

export type EmpresaInfo = {
	telefono: string | null;
	sitioWeb: string | null;
};

/** No permission check: this is what the public site (no session) reads to render tel:/wa.me links. */
export async function obtenerEmpresa(): Promise<EmpresaInfo> {
	const fila = await prisma.empresa_config.findUnique({ where: { id: ID } });
	return { telefono: fila?.telefono ?? null, sitioWeb: fila?.sitioWeb ?? null };
}

export async function guardarEmpresa(input: { actor: Actor; body: Record<string, unknown> }): Promise<EmpresaInfo> {
	if (!can(input.actor.role, "empresa:manage")) throw new ClienteError(403, "Sin permiso: empresa:manage");

	const telefonoRaw = trim(input.body.telefono);
	const telefono = telefonoRaw ? limpiarTelefono(telefonoRaw) : null;
	if (telefonoRaw && !telefono) {
		throw new ClienteError(400, "El teléfono debe tener 10 dígitos.");
	}
	const sitioWeb = trim(input.body.sitioWeb, 200, "El sitio web");

	const antes = await obtenerEmpresa();

	const fila = await prisma.empresa_config.upsert({
		where: { id: ID },
		create: { id: ID, telefono, sitioWeb, actualizadoPorId: input.actor.id },
		update: { telefono, sitioWeb, actualizadoPorId: input.actor.id },
	});

	await recordAudit(prisma, {
		action: "empresa.update",
		actor: input.actor,
		entityId: ID,
		entityLabel: "Información de contacto",
		summary: "Información de contacto de la empresa actualizada",
		before: antes,
		after: { telefono: fila.telefono, sitioWeb: fila.sitioWeb },
	});

	return { telefono: fila.telefono, sitioWeb: fila.sitioWeb };
}
