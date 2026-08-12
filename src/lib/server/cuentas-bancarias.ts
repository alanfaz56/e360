import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import type { Actor } from "./guard";

/**
 * Estación 360's own bank accounts — where a customer transfers payment. `principal` is the one
 * account spliced into a cotización email; see `cuentaBancariaPrincipal` and
 * `src/lib/server/correo/plantillas.ts`.
 */

export const publicCuentaBancaria = (c: {
	id: string;
	banco: string;
	titular: string;
	clabe: string | null;
	numeroCuenta: string | null;
	notas: string | null;
	principal: boolean;
	archivedAt: Date | null;
}) => ({
	id: c.id,
	banco: c.banco,
	titular: c.titular,
	clabe: c.clabe,
	numeroCuenta: c.numeroCuenta,
	notas: c.notas,
	principal: c.principal,
	archivada: c.archivedAt !== null,
});

export async function listCuentasBancarias(actor: Actor, opciones: { archivadas?: boolean } = {}) {
	if (!can(actor.role, "cuenta_bancaria:manage")) throw new ClienteError(403, "Sin permiso: cuenta_bancaria:manage");
	const cuentas = await prisma.cuenta_bancaria.findMany({
		where: opciones.archivadas ? {} : { archivedAt: null },
		orderBy: [{ principal: "desc" }, { banco: "asc" }],
	});
	return cuentas.map(publicCuentaBancaria);
}

/**
 * The one account a cotización email shows. No permission check — called from inside the email
 * builder, not from a route. Null (not an error) when nobody has set one yet, or none is active:
 * an email missing the payment block is a smaller failure than one that 500s.
 */
export async function cuentaBancariaPrincipal() {
	const cuenta = await prisma.cuenta_bancaria.findFirst({ where: { principal: true, archivedAt: null } });
	return cuenta ? publicCuentaBancaria(cuenta) : null;
}

async function despromoverPrincipal(tx: Prisma.TransactionClient, excepto?: string) {
	await tx.cuenta_bancaria.updateMany({
		where: { principal: true, archivedAt: null, ...(excepto ? { id: { not: excepto } } : {}) },
		data: { principal: false },
	});
}

function leerCuentaInput(body: Record<string, unknown>) {
	const banco = trim(body.banco, 100, "El banco");
	if (!banco) throw new ClienteError(400, "El banco es obligatorio");
	const titular = trim(body.titular, 200, "El titular");
	if (!titular) throw new ClienteError(400, "El titular es obligatorio");

	const clabe = trim(body.clabe, 18, "La CLABE");
	if (clabe && !/^\d{18}$/.test(clabe)) throw new ClienteError(400, "La CLABE debe tener 18 dígitos");
	const numeroCuenta = trim(body.numeroCuenta, 30, "El número de cuenta");
	if (!clabe && !numeroCuenta) {
		throw new ClienteError(400, "Captura al menos la CLABE o el número de cuenta");
	}

	return {
		banco,
		titular,
		clabe,
		numeroCuenta,
		notas: trim(body.notas, 255, "Las notas"),
	};
}

export async function crearCuentaBancaria(input: { actor: Actor; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cuenta_bancaria:manage")) {
		throw new ClienteError(403, "Sin permiso: cuenta_bancaria:manage");
	}
	const data = leerCuentaInput(input.body);
	const principal = input.body.principal === true || input.body.principal === "on";

	const cuenta = await prisma.$transaction(async (tx) => {
		if (principal) await despromoverPrincipal(tx);
		const creada = await tx.cuenta_bancaria.create({
			data: { id: randomUUID(), ...data, principal, actualizadoPorId: input.actor.id },
		});
		await recordAudit(tx, {
			action: "cuenta_bancaria.create",
			actor: input.actor,
			entityId: creada.id,
			entityLabel: `${creada.banco} · ${creada.titular}`,
			summary: `Cuenta bancaria agregada: ${creada.banco} (${creada.titular})`,
			after: { banco: creada.banco, titular: creada.titular, principal },
		});
		return creada;
	});

	return publicCuentaBancaria(cuenta);
}

export async function actualizarCuentaBancaria(input: { actor: Actor; id: string; body: Record<string, unknown> }) {
	if (!can(input.actor.role, "cuenta_bancaria:manage")) {
		throw new ClienteError(403, "Sin permiso: cuenta_bancaria:manage");
	}
	const actual = await prisma.cuenta_bancaria.findUnique({ where: { id: input.id } });
	if (!actual) throw new ClienteError(404, "Cuenta bancaria no encontrada");

	const data = leerCuentaInput({
		banco: actual.banco,
		titular: actual.titular,
		clabe: actual.clabe,
		numeroCuenta: actual.numeroCuenta,
		notas: actual.notas,
		...input.body,
	});
	const principal =
		input.body.principal === undefined ? actual.principal : input.body.principal === true || input.body.principal === "on";

	const cuenta = await prisma.$transaction(async (tx) => {
		if (principal && !actual.principal) await despromoverPrincipal(tx, actual.id);
		const guardada = await tx.cuenta_bancaria.update({
			where: { id: actual.id },
			data: { ...data, principal, actualizadoPorId: input.actor.id },
		});
		await recordAudit(tx, {
			action: "cuenta_bancaria.update",
			actor: input.actor,
			entityId: guardada.id,
			entityLabel: `${guardada.banco} · ${guardada.titular}`,
			summary: `Cuenta bancaria actualizada: ${guardada.banco} (${guardada.titular})`,
			before: { banco: actual.banco, titular: actual.titular, principal: actual.principal },
			after: { banco: guardada.banco, titular: guardada.titular, principal },
		});
		return guardada;
	});

	return publicCuentaBancaria(cuenta);
}

/** Archive, never delete: a bank account that has already appeared on a quote is part of the history. */
export async function archivarCuentaBancaria(input: { actor: Actor; id: string; archivada: boolean }) {
	if (!can(input.actor.role, "cuenta_bancaria:manage")) {
		throw new ClienteError(403, "Sin permiso: cuenta_bancaria:manage");
	}
	const actual = await prisma.cuenta_bancaria.findUnique({ where: { id: input.id } });
	if (!actual) throw new ClienteError(404, "Cuenta bancaria no encontrada");
	if ((actual.archivedAt !== null) === input.archivada) {
		throw new ClienteError(409, input.archivada ? "Ya está archivada." : "No está archivada.");
	}

	const cuenta = await prisma.cuenta_bancaria.update({
		where: { id: actual.id },
		// Archiving a principal account leaves nothing selected rather than silently promoting
		// another — which one replaces it is a decision, same reasoning as the taller sucursal.
		data: { archivedAt: input.archivada ? new Date() : null, principal: input.archivada ? false : actual.principal },
	});

	await recordAudit(prisma, {
		action: "cuenta_bancaria.archive",
		actor: input.actor,
		entityId: cuenta.id,
		entityLabel: `${cuenta.banco} · ${cuenta.titular}`,
		summary: `${cuenta.banco} (${cuenta.titular}) ${input.archivada ? "archivada" : "reactivada"}`,
		before: { archivada: actual.archivedAt !== null },
		after: { archivada: input.archivada },
	});

	return publicCuentaBancaria(cuenta);
}
