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

const PASOS = ["nombre", "telefono", "motivo", "tipo", "direccion", "fecha", "franja", "confirmar"] as const;
type Paso = (typeof PASOS)[number];

const TTL_MINUTOS = 30;

type Estado = { paso: Paso; datos: Record<string, string> };

async function leer(canal: string, idExterno: string): Promise<Estado | null> {
	const fila = await prisma.conversacion_estado.findUnique({ where: { canal_idExterno: { canal, idExterno } } });
	if (!fila || fila.expiraAt < new Date()) return null;
	return { paso: fila.paso as Paso, datos: fila.datos as Record<string, string> };
}

async function guardar(canal: string, idExterno: string, estado: Estado): Promise<void> {
	await prisma.conversacion_estado.upsert({
		where: { canal_idExterno: { canal, idExterno } },
		create: {
			id: randomUUID(),
			canal,
			idExterno,
			paso: estado.paso,
			datos: estado.datos,
			expiraAt: new Date(Date.now() + TTL_MINUTOS * 60_000),
		},
		update: { paso: estado.paso, datos: estado.datos, expiraAt: new Date(Date.now() + TTL_MINUTOS * 60_000) },
	});
}

export async function cancelar(canal: string, idExterno: string): Promise<void> {
	await prisma.conversacion_estado.deleteMany({ where: { canal, idExterno } });
}

export async function enProgreso(canal: string, idExterno: string): Promise<boolean> {
	return (await leer(canal, idExterno)) !== null;
}

export async function iniciarBooking(canal: string, idExterno: string): Promise<void> {
	await guardar(canal, idExterno, { paso: "nombre", datos: {} });
}

const PREGUNTA: Record<Paso, string> = {
	nombre: "¿Cuál es tu nombre?",
	telefono: "¿A qué número te podemos llamar o mandar WhatsApp?",
	motivo: "¿Qué necesita tu unidad? Cuéntanos con tus palabras.",
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
	if (datos.direccion) lineas.push(`<b>Dirección:</b> ${escapeHtml(datos.direccion)}`);
	lineas.push(`<b>Día:</b> ${datos.fecha}`, `<b>Horario:</b> ${franja}`);
	return `Así queda tu solicitud:\n\n${lineas.join("\n")}\n\n¿La confirmo?`;
}

export type PasoBooking =
	| { tipo: "pregunta"; texto: string; botones?: { texto: string; callback: string }[]; html?: boolean }
	| { tipo: "completo"; body: Record<string, unknown> }
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
		case "nombre": {
			if (!valor) return { tipo: "pregunta", texto: "Necesito tu nombre para continuar." };
			estado.datos.nombre = valor;
			estado.paso = "telefono";
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
				// `solicitarCitaPorCanal` reads `direccionRecoleccion`, not `direccion` — the name this
				// module uses internally for the same field.
				const { direccion, ...resto } = estado.datos;
				return { tipo: "completo", body: { ...resto, direccionRecoleccion: direccion } };
			}
			await cancelar(canal, idExterno);
			return { tipo: "cancelado" };
		}
	}

	await guardar(canal, idExterno, estado);
	return { tipo: "pregunta", texto: PREGUNTA[estado.paso] };
}
