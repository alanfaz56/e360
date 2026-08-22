/**
 * Resolving and linking a chat identity ("this Telegram chat_id") to a real actor in the app.
 *
 * Two trust models, matching who is allowed to do what — see the WhatsApp/Telegram plan in
 * `.issues/whatsapp-telegram-integracion.md`:
 *
 * - An employee/mechanic must ALREADY be a `user` in this app. Linking is self-service but
 *   requires proving control of the account first (a real session, via `/api/canales/vinculacion`)
 *   AND control of the chat (typing the one-time code into it) — never the other way around.
 *   Modeled exactly on `invitations.ts`: hashed code, TTL, one-time claim via conditional
 *   `updateMany`.
 * - A customer booking a cita needs no link at all — same as the public /citas form, which has
 *   never required an account. `canal_identidad` for a `clienteId` is for a LATER feature
 *   (e.g. "tu cita" follow-up over chat), not required to ship booking.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import prisma from "$lib/prisma";
import { isRole } from "$lib/roles";
import { recordAudit } from "$lib/server/audit";
import { ClienteError } from "$lib/server/clientes";
import type { Actor } from "$lib/server/guard";

const CODIGO_TTL_MINUTOS = 15;

const hashCodigo = (codigo: string) => createHash("sha256").update(codigo).digest("hex");

/** A short code a human can type on a phone keyboard without a typo. Not the security boundary — the hash + TTL + one-time claim are. */
function generarCodigoLegible(): string {
	// Base32-ish alphabet, no 0/O/1/I — the exact pairs people misread when copying off a screen.
	const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	const bytes = randomBytes(6);
	return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

/**
 * Step 1 of linking, done from inside the app (authenticated). Returns the plaintext code —
 * shown ONCE, never stored, same rule as an invitation token or a PAC secret.
 */
export async function generarVinculacion(actor: Actor, canal: "whatsapp" | "telegram") {
	const codigo = generarCodigoLegible();

	await prisma.canal_vinculacion.create({
		data: {
			id: randomUUID(),
			userId: actor.id,
			canal,
			codigoHash: hashCodigo(codigo),
			expiraAt: new Date(Date.now() + CODIGO_TTL_MINUTOS * 60_000),
		},
	});

	await recordAudit(prisma, {
		action: "canal.vinculacion_generada",
		actor,
		entityId: actor.id,
		summary: `${actor.name} generó un código para vincular ${canal}`,
	});

	return { codigo, expiraMinutos: CODIGO_TTL_MINUTOS };
}

/**
 * Step 2, done from the chat: redeem the code the person just typed to the bot. Claims the
 * pairing row (one-time, race-safe) then links THIS chat identity to that user.
 *
 * `idExterno`/`nombreCanal` are trusted as "whatever this chat is", never as "who this person
 * is" — the code is what proves that.
 */
export async function redimirVinculacion(input: {
	canal: "whatsapp" | "telegram";
	idExterno: string;
	nombreCanal?: string | null;
	codigo: string;
}) {
	const codigoHash = hashCodigo(input.codigo.trim().toUpperCase());

	const vinculacion = await prisma.canal_vinculacion.findUnique({ where: { codigoHash } });
	if (!vinculacion || vinculacion.canal !== input.canal) {
		throw new ClienteError(404, "Ese código no es válido.");
	}

	const claimed = await prisma.canal_vinculacion.updateMany({
		where: { id: vinculacion.id, usadoAt: null, revocadoAt: null, expiraAt: { gt: new Date() } },
		data: { usadoAt: new Date() },
	});
	if (claimed.count === 0) throw new ClienteError(409, "Ese código ya venció o ya fue usado. Genera uno nuevo.");

	const usuario = await prisma.user.findUnique({ where: { id: vinculacion.userId } });
	if (!usuario || usuario.banned) throw new ClienteError(403, "Esa cuenta ya no está activa.");

	const identidad = await prisma.canal_identidad.upsert({
		where: { canal_idExterno: { canal: input.canal, idExterno: input.idExterno } },
		create: {
			id: randomUUID(),
			canal: input.canal,
			idExterno: input.idExterno,
			nombreCanal: input.nombreCanal ?? null,
			userId: usuario.id,
		},
		update: { userId: usuario.id, clienteId: null, nombreCanal: input.nombreCanal ?? null, revocadoAt: null },
	});

	await recordAudit(prisma, {
		action: "canal.vinculado",
		actor: { id: usuario.id, email: usuario.email },
		entityId: identidad.id,
		summary: `${usuario.name} vinculó su cuenta a ${input.canal}`,
	});

	return { nombre: usuario.name };
}

/** Resolve `(canal, idExterno)` to a real `Actor`, or `null` if unlinked/revoked — never guessed. */
export async function actorPorCanal(canal: "whatsapp" | "telegram", idExterno: string): Promise<Actor | null> {
	const identidad = await prisma.canal_identidad.findUnique({
		where: { canal_idExterno: { canal, idExterno } },
		include: { user: true },
	});
	if (!identidad || identidad.revocadoAt || !identidad.user) return null;

	const usuario = identidad.user;
	if (usuario.banned || !isRole(usuario.role)) return null;

	prisma.canal_identidad.update({ where: { id: identidad.id }, data: { ultimoUsoAt: new Date() } }).catch(() => {});

	return {
		id: usuario.id,
		email: usuario.email,
		name: usuario.name,
		role: usuario.role,
		tallerId: usuario.role === "taller" ? (usuario.tallerId ?? null) : null,
	};
}

/** YOUR OWN linked channels — for the account screen. Never another user's. */
export async function misCanales(actor: Actor) {
	const filas = await prisma.canal_identidad.findMany({
		where: { userId: actor.id, revocadoAt: null },
		select: { canal: true, nombreCanal: true, verificadoAt: true },
	});
	return filas;
}

/** Unlink one of YOUR OWN channels. Scoped by `userId` in the WHERE, not just the row id — a
 *  stale/guessed id from another account's row can never be revoked this way. */
export async function desvincularCanal(actor: Actor, canal: "whatsapp" | "telegram"): Promise<void> {
	const { count } = await prisma.canal_identidad.updateMany({
		where: { userId: actor.id, canal, revocadoAt: null },
		data: { revocadoAt: new Date() },
	});
	if (count === 0) throw new ClienteError(404, "No tienes ese canal vinculado.");

	await recordAudit(prisma, {
		action: "canal.desvinculado",
		actor,
		entityId: actor.id,
		summary: `${actor.name} desvinculó ${canal}`,
	});
}
