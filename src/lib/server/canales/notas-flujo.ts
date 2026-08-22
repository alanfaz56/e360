/**
 * Multi-turn state for "pick a nota, then comment or attach evidence" over chat — same job as
 * `conversacion.ts`'s booking flow, and the same table (`conversacion_estado`), but a distinct
 * `paso` namespace (`nota_*` vs. booking's own step names) so the two flows never collide on the
 * one row a chat can hold. Picking a note itself is stateless (the button's `callback_data`
 * carries the folio); state starts only once the person has chosen an accion.
 */
import { randomUUID } from "node:crypto";
import prisma from "$lib/prisma";

const TTL_MINUTOS = 30;
const PREFIJO = "nota_";

type Paso = "accion" | "comentario" | "evidencia";
type Estado = { paso: Paso; folio: number; notaId: string };

async function leer(canal: string, idExterno: string): Promise<Estado | null> {
	const fila = await prisma.conversacion_estado.findUnique({ where: { canal_idExterno: { canal, idExterno } } });
	if (!fila || fila.expiraAt < new Date() || !fila.paso.startsWith(PREFIJO)) return null;
	const datos = fila.datos as Record<string, string>;
	return { paso: fila.paso.slice(PREFIJO.length) as Paso, folio: Number(datos.folio), notaId: datos.notaId };
}

async function guardar(canal: string, idExterno: string, estado: Estado): Promise<void> {
	const datos = { folio: String(estado.folio), notaId: estado.notaId };
	await prisma.conversacion_estado.upsert({
		where: { canal_idExterno: { canal, idExterno } },
		create: {
			id: randomUUID(),
			canal,
			idExterno,
			paso: PREFIJO + estado.paso,
			datos,
			expiraAt: new Date(Date.now() + TTL_MINUTOS * 60_000),
		},
		update: { paso: PREFIJO + estado.paso, datos, expiraAt: new Date(Date.now() + TTL_MINUTOS * 60_000) },
	});
}

export async function enProgreso(canal: string, idExterno: string): Promise<boolean> {
	return (await leer(canal, idExterno)) !== null;
}

export async function estadoActual(canal: string, idExterno: string): Promise<Estado | null> {
	return leer(canal, idExterno);
}

/** Only clears a row that is actually ours — never touches an in-progress booking. */
export async function cancelar(canal: string, idExterno: string): Promise<void> {
	if (await leer(canal, idExterno)) await prisma.conversacion_estado.deleteMany({ where: { canal, idExterno } });
}

export async function iniciarAccion(canal: string, idExterno: string, folio: number, notaId: string): Promise<void> {
	await guardar(canal, idExterno, { paso: "accion", folio, notaId });
}

/** Move from "which accion" to "waiting for its content". `null` means the picker step expired. */
export async function elegir(
	canal: string,
	idExterno: string,
	accion: "comentario" | "evidencia",
): Promise<Estado | null> {
	const estado = await leer(canal, idExterno);
	if (!estado || estado.paso !== "accion") return null;
	const nuevo: Estado = { ...estado, paso: accion };
	await guardar(canal, idExterno, nuevo);
	return nuevo;
}
