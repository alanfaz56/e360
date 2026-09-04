/**
 * Multi-turn state for booking a cita over chat. Webhooks are stateless HTTP calls — this table
 * is the only thing that remembers "we already have their name, we're waiting on a date" between
 * one message and the next.
 *
 * Deliberately dumb: a fixed linear sequence of steps, one field per message, re-asking on any
 * validation error. It only ever assembles the same `body` shape `solicitarCita` already
 * validates — this module never re-implements a business rule, it just collects the fields.
 */
import { randomUUID } from "node:crypto";
import prisma from "$lib/prisma";
import { CITA_TIPOS, FRANJAS } from "$lib/citas";
import { listUnidades, unidadLabel } from "$lib/server/unidades";

const PASOS = [
	"verificar",
	"nombre",
	"telefono",
	"motivo",
	"unidad",
	"tipo",
	"direccion",
	"fecha",
	"franja",
	"confirmar",
] as const;
type Paso = (typeof PASOS)[number];

const TTL_MINUTOS = 30;

export type Estado = { paso: Paso; datos: Record<string, string> };

// This module only ever drives the booking flow — every row it touches is tipo:"booking",
// the default value new rows get. Other flows (verification, later survey) use their own
// tipo so they never collide with a booking mid-flight under the same (canal, idExterno).
const TIPO = "booking";

async function leer(canal: string, idExterno: string): Promise<Estado | null> {
	const fila = await prisma.conversacion_estado.findUnique({
		where: { canal_idExterno_tipo: { canal, idExterno, tipo: TIPO } },
	});
	if (!fila || fila.expiraAt < new Date()) return null;
	return { paso: fila.paso as Paso, datos: fila.datos as Record<string, string> };
}

async function guardar(canal: string, idExterno: string, estado: Estado): Promise<void> {
	await prisma.conversacion_estado.upsert({
		where: { canal_idExterno_tipo: { canal, idExterno, tipo: TIPO } },
		create: {
			id: randomUUID(),
			canal,
			idExterno,
			tipo: TIPO,
			paso: estado.paso,
			datos: estado.datos,
			expiraAt: new Date(Date.now() + TTL_MINUTOS * 60_000),
		},
		update: { paso: estado.paso, datos: estado.datos, expiraAt: new Date(Date.now() + TTL_MINUTOS * 60_000) },
	});
}

export async function cancelar(canal: string, idExterno: string): Promise<void> {
	await prisma.conversacion_estado.deleteMany({ where: { canal, idExterno, tipo: TIPO } });
}

/**
 * Snapshot / restore, for the one case where advancing was a mistake: `avanzar` has already
 * committed the next step by the time the caller tries to SEND the question, and a send that
 * fails (Meta rejection, rate limit) would otherwise leave the customer advanced past a question
 * they never saw — with `canal_evento`'s dedupe suppressing the retry that would have re-asked
 * it. The webhook snapshots before advancing and restores on a send failure, so the customer's
 * next message re-runs the same step. `null` means there was no row to begin with.
 */
export async function instantanea(canal: string, idExterno: string): Promise<Estado | null> {
	return leer(canal, idExterno);
}

export async function restaurar(canal: string, idExterno: string, estado: Estado | null): Promise<void> {
	if (!estado) {
		await cancelar(canal, idExterno);
		return;
	}
	await guardar(canal, idExterno, estado);
}

export async function enProgreso(canal: string, idExterno: string): Promise<boolean> {
	return (await leer(canal, idExterno)) !== null;
}

/**
 * `conocido` skips the `nombre`/`telefono` steps for a phone-verified conversation — the shop
 * already has both on file with certainty, asking again just invites a typo'd mismatch against
 * the record `avanzar`'s `completo` step will end up linking to.
 */
/**
 * `verificado` (name + clienteId, both known with certainty) skips straight past `nombre` to a
 * confirmation step — see the `verificar` case in `avanzar`. `telefono` alone (WhatsApp always
 * has the sender's number; Telegram never does) only skips the `telefono` question, landing on
 * whichever step is first still unknown.
 */
export async function iniciarBooking(
	canal: string,
	idExterno: string,
	conocido?: { telefono?: string; verificado?: { nombre: string; clienteId: string } },
): Promise<void> {
	if (conocido?.verificado) {
		// One more question than skipping straight to `motivo`, on purpose: the verified NUMBER
		// is trusted, but the phone could be a shared/family line — "¿Eres X?" catches that
		// before the bot puts words in the wrong person's mouth. A "no" falls through to the
		// normal unverified flow (see `avanzar`'s `verificar` case).
		await guardar(canal, idExterno, {
			paso: "verificar",
			datos: {
				nombre: conocido.verificado.nombre,
				telefono: conocido.telefono ?? "",
				clienteId: conocido.verificado.clienteId,
			},
		});
		return;
	}
	if (conocido?.telefono) {
		await guardar(canal, idExterno, { paso: "nombre", datos: { telefono: conocido.telefono } });
		return;
	}
	await guardar(canal, idExterno, { paso: "nombre", datos: {} });
}

const PREGUNTA: Record<Paso, string> = {
	verificar: "",
	nombre: "¿Cuál es tu nombre?",
	telefono: "¿A qué número te podemos llamar o mandar WhatsApp?",
	motivo: "¿Qué necesita tu unidad? Cuéntanos con tus palabras.",
	unidad: "",
	tipo: "¿Nos traes la unidad al taller, o pasamos por ella?",
	direccion: "¿En qué dirección recogemos la unidad? (calle, número y colonia)",
	fecha: "¿Qué día te acomoda? (formato AAAA-MM-DD, ej. 2026-08-25)",
	franja: "¿Prefieres en la mañana o en la tarde?",
	confirmar: "",
};

/** Telegram's HTML parse mode 400s the whole message on an unescaped `<`/`>`/`&` — and every
 *  field here is what a customer just typed. */
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function resumen(datos: Record<string, string>): string {
	const tipo = datos.tipo === "recoleccion" ? CITA_TIPOS.recoleccion.label : CITA_TIPOS.en_sitio.label;
	const franja = datos.franja === "manana" ? FRANJAS.manana.label : FRANJAS.tarde.label;
	const lineas = [
		`<b>Nombre:</b> ${escapeHtml(datos.nombre)}`,
		`<b>Teléfono:</b> ${escapeHtml(datos.telefono)}`,
		`<b>Motivo:</b> ${escapeHtml(datos.motivo)}`,
		`<b>Modalidad:</b> ${tipo}`,
	];
	if (datos.unidadEtiqueta) lineas.push(`<b>Unidad:</b> ${escapeHtml(datos.unidadEtiqueta)}`);
	if (datos.direccion) lineas.push(`<b>Dirección:</b> ${escapeHtml(datos.direccion)}`);
	lineas.push(`<b>Día:</b> ${datos.fecha}`, `<b>Horario:</b> ${franja}`);
	return `Así queda tu solicitud:\n\n${lineas.join("\n")}\n\n¿La confirmo?`;
}

/**
 * How many of a customer's units to offer. Two fit alongside the "Otra unidad" escape hatch in
 * WhatsApp's 3-button cap; beyond that the same options are sent as a numbered text prompt, so a
 * customer with a fleet can still reach every one of them.
 */
const MAX_UNIDADES = 8;

type UnidadOpcion = { id: string; marca: string; modelo: string; placas: string | null; numeroEconomico: string | null };

/**
 * `unidadLabel` (shared with the panel and the audit trail) appends placas/número económico, which
 * is what makes two units of the same marca+modelo — a real case in a fleet — tellable apart.
 */
function preguntaUnidad(unidades: UnidadOpcion[]): PasoBooking {
	if (unidades.length <= 2) {
		return {
			tipo: "pregunta",
			texto: "¿Es alguna de estas unidades, u otra?",
			botones: [
				...unidades.map((u) => ({ texto: unidadLabel(u), callback: `cita:unidad:${u.id}` })),
				{ texto: "Otra unidad", callback: "cita:unidad:otra" },
			],
		};
	}
	const lineas = unidades.map((u, i) => `${i + 1}. ${unidadLabel(u)}`);
	return {
		tipo: "pregunta",
		texto: `¿Cuál de tus unidades es? Responde con el número:\n\n${lineas.join("\n")}\n\nO escribe "otra" si no está en la lista.`,
	};
}

export type PasoBooking =
	| { tipo: "pregunta"; texto: string; botones?: { texto: string; callback: string }[]; html?: boolean }
	| { tipo: "completo"; body: Record<string, unknown>; unidadId?: string }
	| { tipo: "cancelado" };

/**
 * Advance the conversation by one message. `entrada.boton` wins over `entrada.texto` when both
 * are present — a button tap is unambiguous, free text after one is very likely a typo retry.
 */
export async function avanzar(
	canal: string,
	idExterno: string,
	entrada: { texto?: string; boton?: string },
): Promise<PasoBooking> {
	const estado = await leer(canal, idExterno);
	if (!estado) return { tipo: "cancelado" };

	const valor = (entrada.boton ?? entrada.texto ?? "").trim();

	if (valor.toLowerCase() === "cancelar") {
		await cancelar(canal, idExterno);
		return { tipo: "cancelado" };
	}

	switch (estado.paso) {
		case "verificar": {
			// Customers type as often as they tap, so plain "sí"/"no" count alongside the button
			// payloads. Anything else re-asks rather than being read as a "no" — same treatment
			// `tipo` and `franja` already give unrecognized input.
			const dijoSi = valor === "cita:verificar:si" || /^s[ií]$/i.test(valor);
			const dijoNo = valor === "cita:verificar:no" || /^no$/i.test(valor);
			if (!dijoSi && !dijoNo) {
				return {
					tipo: "pregunta",
					texto: `¿Eres ${estado.datos.nombre}?`,
					botones: [
						{ texto: "✅ Sí", callback: "cita:verificar:si" },
						{ texto: "No", callback: "cita:verificar:no" },
					],
				};
			}

			if (dijoNo) {
				// The number is shared/wasn't who we thought — drop the identity so the unit step
				// never fires for them, but KEEP the phone: it came from the WhatsApp sender, it's
				// still their number, and re-asking for it is exactly what this flow avoids.
				const { telefono } = estado.datos;
				estado.datos = telefono ? { telefono } : {};
				estado.paso = "nombre";
				await guardar(canal, idExterno, estado);
				return { tipo: "pregunta", texto: PREGUNTA.nombre };
			}

			// `telefono` is required at cita creation (`leerDatosContacto`), and a cliente row can
			// carry an empty one — ask rather than failing six questions later.
			estado.paso = estado.datos.telefono ? "motivo" : "telefono";
			await guardar(canal, idExterno, estado);
			return { tipo: "pregunta", texto: PREGUNTA[estado.paso] };
		}
		case "nombre": {
			if (!valor) return { tipo: "pregunta", texto: "Necesito tu nombre para continuar." };
			estado.datos.nombre = valor;
			// A WhatsApp booking already knows `telefono` from the sender (see `iniciarBooking`) —
			// only Telegram (no reliable number) ever actually lands on the `telefono` question.
			estado.paso = estado.datos.telefono ? "motivo" : "telefono";
			break;
		}
		case "telefono": {
			if (!valor) return { tipo: "pregunta", texto: "Necesito un teléfono para continuar." };
			estado.datos.telefono = valor;
			estado.paso = "motivo";
			break;
		}
		case "motivo": {
			if (!valor) return { tipo: "pregunta", texto: "Cuéntanos qué necesita la unidad." };
			estado.datos.motivo = valor;

			// Only a verified conversation carries a clienteId to look units up by — an unverified
			// customer gets exactly today's flow, straight to `tipo`.
			const unidades = estado.datos.clienteId
				? (await listUnidades({ clienteId: estado.datos.clienteId, perPage: MAX_UNIDADES })).unidades
				: [];
			if (unidades.length > 0) {
				estado.paso = "unidad";
				// The id list is pinned in `datos` so the `unidad` step validates against exactly
				// what was offered, in the order it was offered — a re-query could come back in a
				// different order (or with a unit added since) and renumber the options underneath
				// a customer who is mid-answer.
				estado.datos.unidadOpciones = unidades.map((u) => u.id).join(",");
				await guardar(canal, idExterno, estado);
				return preguntaUnidad(unidades);
			}

			estado.paso = "tipo";
			await guardar(canal, idExterno, estado);
			return {
				tipo: "pregunta",
				texto: PREGUNTA.tipo,
				botones: [
					{ texto: `🚚 ${CITA_TIPOS.recoleccion.label}`, callback: "cita:tipo:recoleccion" },
					{ texto: `🔧 ${CITA_TIPOS.en_sitio.label}`, callback: "cita:tipo:en_sitio" },
				],
			};
		}
		case "unidad": {
			const opciones = (estado.datos.unidadOpciones ?? "").split(",").filter(Boolean);
			const eleccion = valor.replace("cita:unidad:", "");

			let elegida: string | null = null;
			if (eleccion === "otra" || /^otra?$/i.test(valor)) {
				elegida = null;
			} else if (opciones.includes(eleccion)) {
				// A button tap, carrying the unit's own id.
				elegida = eleccion;
			} else if (/^\d+$/.test(valor) && Number(valor) >= 1 && Number(valor) <= opciones.length) {
				// A typed number, from the >2-units text prompt.
				elegida = opciones[Number(valor) - 1];
			} else {
				// Anything else re-asks instead of being swallowed as a unit id — the old behaviour
				// accepted free text here and silently skipped the question. Only reachable with a
				// clienteId (see `motivo`), but a row can outlive that: fall forward rather than
				// re-asking a question with no options in it.
				const unidades = estado.datos.clienteId
					? (await listUnidades({ clienteId: estado.datos.clienteId, perPage: MAX_UNIDADES })).unidades
					: [];
				if (unidades.length > 0) return preguntaUnidad(unidades);
				elegida = null;
			}

			if (elegida) {
				estado.datos.unidadId = elegida;
				const unidad = await prisma.unidad.findUnique({
					where: { id: elegida },
					select: { marca: true, modelo: true, placas: true, numeroEconomico: true },
				});
				// Kept for the confirmation summary, so the customer sees WHICH unit they picked
				// before saying yes.
				if (unidad) estado.datos.unidadEtiqueta = unidadLabel(unidad);
			} else {
				delete estado.datos.unidadId;
				delete estado.datos.unidadEtiqueta;
			}
			delete estado.datos.unidadOpciones;

			estado.paso = "tipo";
			await guardar(canal, idExterno, estado);
			return {
				tipo: "pregunta",
				texto: PREGUNTA.tipo,
				botones: [
					{ texto: `🚚 ${CITA_TIPOS.recoleccion.label}`, callback: "cita:tipo:recoleccion" },
					{ texto: `🔧 ${CITA_TIPOS.en_sitio.label}`, callback: "cita:tipo:en_sitio" },
				],
			};
		}
		case "tipo": {
			const tipo = valor.replace("cita:tipo:", "");
			if (tipo !== "recoleccion" && tipo !== "en_sitio") {
				return {
					tipo: "pregunta",
					texto: PREGUNTA.tipo,
					botones: [
						{ texto: `🚚 ${CITA_TIPOS.recoleccion.label}`, callback: "cita:tipo:recoleccion" },
						{ texto: `🔧 ${CITA_TIPOS.en_sitio.label}`, callback: "cita:tipo:en_sitio" },
					],
				};
			}
			estado.datos.tipo = tipo;
			estado.paso = tipo === "recoleccion" ? "direccion" : "fecha";
			break;
		}
		case "direccion": {
			if (!valor) return { tipo: "pregunta", texto: "Necesito la dirección para ir por la unidad." };
			estado.datos.direccion = valor;
			estado.paso = "fecha";
			break;
		}
		case "fecha": {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
				return { tipo: "pregunta", texto: "Ese formato no lo reconozco. Escribe la fecha como AAAA-MM-DD." };
			}
			estado.datos.fecha = valor;
			estado.paso = "franja";
			await guardar(canal, idExterno, estado);
			return {
				tipo: "pregunta",
				texto: PREGUNTA.franja,
				botones: [
					{ texto: `🌅 ${FRANJAS.manana.label}`, callback: "cita:franja:manana" },
					{ texto: `🌇 ${FRANJAS.tarde.label}`, callback: "cita:franja:tarde" },
				],
			};
		}
		case "franja": {
			const franja = valor.replace("cita:franja:", "");
			if (franja !== "manana" && franja !== "tarde") {
				return {
					tipo: "pregunta",
					texto: PREGUNTA.franja,
					botones: [
						{ texto: `🌅 ${FRANJAS.manana.label}`, callback: "cita:franja:manana" },
						{ texto: `🌇 ${FRANJAS.tarde.label}`, callback: "cita:franja:tarde" },
					],
				};
			}
			estado.datos.franja = franja;
			estado.paso = "confirmar";
			await guardar(canal, idExterno, estado);
			return {
				tipo: "pregunta",
				texto: resumen(estado.datos),
				html: true,
				botones: [
					{ texto: "✅ Sí, agendar", callback: "cita:confirmar:si" },
					{ texto: "✖️ Cancelar", callback: "cita:confirmar:no" },
				],
			};
		}
		case "confirmar": {
			if (valor === "cita:confirmar:si") {
				await cancelar(canal, idExterno);
				// `clienteId`/`unidadId` are for THIS module's post-creation auto-link, never fields
				// on the `cita` create body itself — `solicitarCitaPorCanal` reads `direccionRecoleccion`,
				// not `direccion`, the name this module uses internally for the same field.
				// eslint-disable-next-line @typescript-eslint/no-unused-vars -- these are this
				// module's own bookkeeping, never columns on `cita`: clienteId is re-resolved by the
				// webhook via clientePorCanal, and the unidad keys are for the picker and summary.
				const {
					direccion,
					clienteId: _clienteId,
					unidadEtiqueta: _unidadEtiqueta,
					unidadOpciones: _unidadOpciones,
					unidadId,
					...resto
				} = estado.datos;
				return { tipo: "completo", body: { ...resto, direccionRecoleccion: direccion }, unidadId };
			}
			await cancelar(canal, idExterno);
			return { tipo: "cancelado" };
		}
	}

	await guardar(canal, idExterno, estado);
	// `verificar`, `unidad` and `confirmar` have no plain question text — every path to them
	// returns its own prompt above. Reaching here with one would send an empty message, which
	// Meta rejects with a 400; re-asking the previous step is the harmless way to fail.
	const pregunta = PREGUNTA[estado.paso];
	if (!pregunta) {
		console.error(`conversacion: paso "${estado.paso}" sin pregunta propia`);
		return { tipo: "pregunta", texto: "¿Me lo repites, por favor?" };
	}
	return { tipo: "pregunta", texto: pregunta };
}
