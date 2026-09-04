/**
 * Linking a chat identity to a real `cliente` — the customer-facing counterpart to
 * `identidad.ts`'s employee linking, same shape but staff-initiated instead of self-service:
 * a staff member sends a one-time code to the phone the shop already has on file, the customer
 * proves control of THAT number by typing it back into the chat. See the "Decided" section of
 * `.issues/whatsapp-flujos-cliente.md` for why this is a new parallel module rather than a
 * `user`/`cliente` union bolted onto `identidad.ts`.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { recordAudit } from "$lib/server/audit";
import { ClienteError } from "$lib/server/clientes";
import type { Actor } from "$lib/server/guard";
import { enviarMensaje } from "$lib/server/canales/whatsapp";

const CODIGO_TTL_MINUTOS = 15;

const hashCodigo = (codigo: string) => createHash("sha256").update(codigo).digest("hex");

/**
 * Phone numbers are stored however they were typed — a survey of real rows found both
 * "+526621960312" and bare 10-digit locals like "6621002031" (every `cliente_contacto` phone on
 * file is the latter). Meta's webhook always reports the sender in its own wa_id form,
 * "5216621960312": MX mobiles get an extra "1" after the "52" country code and lose the "+".
 *
 * The code has to be stored under the SAME string the webhook will send back, or the reply can
 * never match and the code is silently unredeemable. Inverse of `aEnvioMx` in `whatsapp.ts`,
 * which strips that "1" back off for outbound sends; the two are a pair, change them together.
 *
 * MX only — this shop is Hermosillo-only (see CLAUDE.md); a second country is a later problem.
 */
function aWaId(telefono: string): string {
	const digitos = telefono.replace(/\D/g, "");
	if (digitos.length === 10) return "521" + digitos;
	if (digitos.startsWith("52") && !digitos.startsWith("521") && digitos.length === 12) {
		return "521" + digitos.slice(2);
	}
	return digitos;
}

/** Same alphabet/approach as identidad.ts's generarCodigoLegible — no 0/O/1/I, byte-random. */
function generarCodigoLegible(): string {
	const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	const bytes = randomBytes(6);
	return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

/** The cliente's phone to send a code to: principal cliente_telefono row first, cliente.telefono as fallback. */
async function telefonoDeCliente(clienteId: string): Promise<string | null> {
	const principal = await prisma.cliente_telefono.findFirst({
		where: { clienteId, esPrincipal: true, archivedAt: null },
		select: { telefono: true },
	});
	if (principal) return principal.telefono;

	const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { telefono: true } });
	return cliente?.telefono ?? null;
}

/**
 * Staff-triggered step 1: pick the cliente's phone on file, generate a code, store it hashed
 * (with the phone it was sent to, so redemption can only come from that same number), send it.
 */
export async function enviarCodigoVerificacion(
	actor: Actor,
	clienteId: string,
): Promise<{ expiraMinutos: number }> {
	if (!can(actor.role, "canal:verificar-cliente")) {
		throw new ClienteError(403, "Sin permiso: canal:verificar-cliente");
	}

	const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true, nombreCompleto: true } });
	if (!cliente) throw new ClienteError(404, "Cliente no encontrado");

	const telefono = await telefonoDeCliente(clienteId);
	if (!telefono) throw new ClienteError(400, "Este cliente no tiene teléfono registrado.");
	const idExterno = aWaId(telefono);

	const codigo = generarCodigoLegible();

	await prisma.cliente_verificacion.create({
		data: {
			id: randomUUID(),
			clienteId,
			canal: "whatsapp",
			idExterno,
			codigoHash: hashCodigo(codigo),
			expiraAt: new Date(Date.now() + CODIGO_TTL_MINUTOS * 60_000),
		},
	});

	await enviarMensaje(idExterno, `Tu código de verificación Estación 360: ${codigo}`);

	await recordAudit(prisma, {
		action: "canal.verificacion_generada",
		actor,
		entityId: clienteId,
		entityLabel: cliente.nombreCompleto,
		summary: `${actor.name} envió un código de verificación de WhatsApp a ${cliente.nombreCompleto}`,
	});

	return { expiraMinutos: CODIGO_TTL_MINUTOS };
}

/**
 * Step 2, done from the chat: redeem the code the customer just typed. Claims the row
 * (one-time, race-safe, same conditional-updateMany shape as identidad.ts's redimirVinculacion),
 * checks it was sent to THIS number, then links the conversation and the identity.
 *
 * Returns `null` on any failure — bad code, expired, wrong number — never a distinguishable
 * error. Leaking which check failed would let someone probe for valid phone numbers/timing.
 */
export async function redimirVerificacion(input: {
	canal: "whatsapp";
	idExterno: string;
	codigo: string;
}): Promise<{ clienteNombre: string } | null> {
	const codigoHash = hashCodigo(input.codigo.trim().toUpperCase());

	const verificacion = await prisma.cliente_verificacion.findUnique({ where: { codigoHash } });
	if (!verificacion || verificacion.canal !== input.canal || verificacion.idExterno !== input.idExterno) {
		return null;
	}

	const claimed = await prisma.cliente_verificacion.updateMany({
		where: { id: verificacion.id, usadoAt: null, revocadoAt: null, expiraAt: { gt: new Date() } },
		data: { usadoAt: new Date() },
	});
	if (claimed.count === 0) return null;

	const cliente = await prisma.cliente.findUnique({ where: { id: verificacion.clienteId } });
	if (!cliente || cliente.archivedAt) return null;

	// The conversation row already exists by the time this runs — registrarMensajeEntrante
	// upserts it before continuarFlujo ever calls this. If it somehow doesn't, there is no
	// conversation to link and redemption fails closed rather than creating one implicitly.
	const conversacion = await prisma.canal_conversacion
		.update({
			where: { canal_idExterno: { canal: input.canal, idExterno: input.idExterno } },
			data: { clienteId: cliente.id },
		})
		.catch(() => null);
	if (!conversacion) return null;

	await prisma.canal_identidad.upsert({
		where: { canal_idExterno: { canal: input.canal, idExterno: input.idExterno } },
		create: {
			id: randomUUID(),
			canal: input.canal,
			idExterno: input.idExterno,
			clienteId: cliente.id,
		},
		update: { clienteId: cliente.id, userId: null, revocadoAt: null },
	});

	await recordAudit(prisma, {
		action: "canal.cliente_verificado",
		actor: { id: null, email: "sistema@whatsapp" },
		entityId: cliente.id,
		entityLabel: cliente.nombreCompleto,
		summary: `${cliente.nombreCompleto} verificó su número de WhatsApp`,
	});

	return { clienteNombre: cliente.nombreCompleto };
}

/**
 * Staff-attested shortcut: skip the code entirely when staff is already looking at proof the
 * number is real — e.g. confirming a cita that arrived through this exact WhatsApp conversation
 * (`cita.origenConversacionId`). The code flow exists for when nobody's reviewing anything; this
 * is for when a human already is. Same permission as sending a code — this is still "assert this
 * number belongs to this cliente", just attested by staff instead of by redeeming a secret.
 */
export async function verificarManualmente(
	actor: Actor,
	canal: "whatsapp",
	idExterno: string,
	clienteId: string,
): Promise<void> {
	if (!can(actor.role, "canal:verificar-cliente")) {
		throw new ClienteError(403, "Sin permiso: canal:verificar-cliente");
	}

	const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true, nombreCompleto: true } });
	if (!cliente) throw new ClienteError(404, "Cliente no encontrado");

	const conversacion = await prisma.canal_conversacion
		.update({ where: { canal_idExterno: { canal, idExterno } }, data: { clienteId } })
		.catch(() => null);
	if (!conversacion) throw new ClienteError(404, "Esa conversación no existe.");

	await prisma.canal_identidad.upsert({
		where: { canal_idExterno: { canal, idExterno } },
		create: { id: randomUUID(), canal, idExterno, clienteId },
		update: { clienteId, userId: null, revocadoAt: null },
	});

	await recordAudit(prisma, {
		action: "canal.cliente_verificado",
		actor,
		entityId: clienteId,
		entityLabel: cliente.nombreCompleto,
		summary: `${actor.name} verificó manualmente el WhatsApp de ${cliente.nombreCompleto}`,
	});
}

/**
 * Resolve `(canal, idExterno)` to the cliente this conversation is linked to, or `null` if
 * unverified. Later phases (status check, quote authorize, reminders) call this to decide
 * whether they can trust "whose conversation is this".
 */
export async function clientePorCanal(
	canal: "whatsapp",
	idExterno: string,
): Promise<{ id: string; nombreCompleto: string; telefono: string | null } | null> {
	const conversacion = await prisma.canal_conversacion.findUnique({
		where: { canal_idExterno: { canal, idExterno } },
		include: { cliente: { select: { id: true, nombreCompleto: true, telefono: true, archivedAt: true } } },
	});
	// An archived cliente is not somebody to greet by name, offer their units to, or auto-link a
	// cita to — same check `redimirVerificacion` makes before linking in the first place.
	if (!conversacion?.cliente || conversacion.cliente.archivedAt) return null;

	const { archivedAt: _archivedAt, ...cliente } = conversacion.cliente;
	return cliente;
}

/** Is there an unexpired, unused verification code outstanding for this number? Gates the
 *  webhook's "treat this incoming message as a code attempt" branch. */
export async function verificacionPendiente(canal: "whatsapp", idExterno: string): Promise<boolean> {
	const fila = await prisma.cliente_verificacion.findFirst({
		where: { canal, idExterno, usadoAt: null, revocadoAt: null, expiraAt: { gt: new Date() } },
		select: { id: true },
	});
	return fila !== null;
}
