import prisma from "$lib/prisma";
import { peticionPush, type Suscripcion, type VapidKeys } from "$lib/webpush";

/**
 * Delivery to the browser push services. Everything that touches the environment or the network
 * lives here; the crypto itself is pure in `$lib/webpush` so it can be pinned to the RFC vector.
 *
 * **Push failing is never an error the caller sees.** The `notificacion` row is the system of
 * record and it is already written by the time we get here — push is the courtesy on top. A shop
 * with no VAPID keys configured still gets a fully working in-app inbox, which is what "graceful
 * fallback when browser push is unavailable" has to mean when the alternative is a 503 on an
 * endpoint nobody asked to be notified from.
 */

/**
 * `$env/dynamic/private` is a real SvelteKit virtual module — it does not exist as a file, so it
 * cannot resolve outside Vite. Read it lazily (never at module top level) so this file, and
 * everything that imports it, stays loadable from a plain `tsx` script — the import-mitaller
 * script goes through `crearNota`/`avanzarNota`/etc., which pull this module in transitively.
 */
async function leerEnv() {
	return (await import("$env/dynamic/private")).env;
}

export async function vapidKeys(): Promise<VapidKeys | null> {
	const env = await leerEnv();
	const publicKey = env.VAPID_PUBLIC_KEY;
	const privateKey = env.VAPID_PRIVATE_KEY;
	if (!publicKey || !privateKey) return null;
	// `sub` must be a mailto: or https: the push service can complain to. RFC 8292 §2.1.
	return { publicKey, privateKey, subject: env.VAPID_SUBJECT || "mailto:soporte@estacion360.mx" };
}

/** What the browser needs to call `pushManager.subscribe`. Empty string means push is off. */
export const clavePublicaVapid = async (): Promise<string> => (await leerEnv()).VAPID_PUBLIC_KEY ?? "";

export type PayloadPush = {
	titulo: string;
	cuerpo: string;
	url?: string | null;
	evento: string;
	/** The notification row, so a click can mark it read without a second lookup. */
	id?: string;
	prioritario?: boolean;
};

type Fila = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Send to one device.
 *
 * A 404 or 410 from the push service is the standardised way of saying "this subscription is
 * dead" — the browser was uninstalled, the user cleared site data, the token rotated. Deleting
 * the row on the spot is what keeps the device list honest and stops us signing payloads for an
 * endpoint that will never accept another one.
 */
async function enviarAUna(fila: Fila, keys: VapidKeys, payload: PayloadPush): Promise<boolean> {
	const sub: Suscripcion = { endpoint: fila.endpoint, p256dh: fila.p256dh, auth: fila.auth };

	let res: Response;
	try {
		const p = peticionPush(sub, keys, JSON.stringify(payload), {
			urgencia: payload.prioritario ? "high" : "normal",
		});
		res = await fetch(p.url, {
			method: "POST",
			headers: p.headers,
			body: new Uint8Array(p.body),
			// ponytail: a plain per-request timeout, no retry queue. Push services are meant to do
			// the retrying — they hold the message for TTL. If delivery ever needs real retries,
			// that is a job queue, not a loop here.
			signal: AbortSignal.timeout(8000),
		});
	} catch {
		await prisma.push_suscripcion.update({ where: { id: fila.id }, data: { fallos: { increment: 1 } } });
		return false;
	}

	if (res.status === 404 || res.status === 410) {
		await prisma.push_suscripcion.delete({ where: { id: fila.id } }).catch(() => {});
		return false;
	}

	if (!res.ok) {
		await prisma.push_suscripcion.update({ where: { id: fila.id }, data: { fallos: { increment: 1 } } });
		return false;
	}

	await prisma.push_suscripcion.update({
		where: { id: fila.id },
		data: { fallos: 0, ultimoEnvioAt: new Date() },
	});
	return true;
}

/**
 * Fan out one payload to every device belonging to these recipients.
 *
 * One query for all the subscriptions rather than one per person: a broadcast to six staff is
 * one round trip, not six. Returns how many devices took it, for the audit line on a manual send.
 */
export async function enviarPush(
	destinatarios: { userIds?: string[]; clienteIds?: string[] },
	payload: PayloadPush,
): Promise<number> {
	const keys = await vapidKeys();
	if (!keys) return 0;

	const userIds = destinatarios.userIds?.filter(Boolean) ?? [];
	const clienteIds = destinatarios.clienteIds?.filter(Boolean) ?? [];
	if (userIds.length === 0 && clienteIds.length === 0) return 0;

	const filas = await prisma.push_suscripcion.findMany({
		where: {
			OR: [
				...(userIds.length ? [{ userId: { in: userIds } }] : []),
				...(clienteIds.length ? [{ clienteId: { in: clienteIds } }] : []),
			],
		},
		select: { id: true, endpoint: true, p256dh: true, auth: true },
	});
	if (filas.length === 0) return 0;

	const resultados = await Promise.allSettled(filas.map((f) => enviarAUna(f, keys, payload)));
	return resultados.filter((r) => r.status === "fulfilled" && r.value).length;
}
