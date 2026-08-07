import { dev } from "$app/environment";

/**
 * Browser side of Web Push: register the worker, subscribe, tell the server.
 *
 * Every function reports a *state*, never throws for an ordinary outcome. Notification permission
 * being denied is a normal thing for a person to choose, not an exception — and the UI has to say
 * something different for "your browser cannot do this", "you said no", and "it broke".
 */

export type EstadoPush =
	/** No Service Worker, no PushManager, or no Notification API. Safari < 16.4, most in-app browsers. */
	| "no-soportado"
	/** The server has no VAPID keys. In-app notifications still work. */
	| "sin-configurar"
	/** Never asked. */
	| "sin-permiso"
	/** The person said no. Only they can undo it, from the browser's site settings. */
	| "bloqueado"
	/** Subscribed on this device. */
	| "activo"
	/** Permission granted but no subscription yet on this device. */
	| "inactivo";

export const soportaPush = (): boolean =>
	typeof window !== "undefined" &&
	"serviceWorker" in navigator &&
	"PushManager" in window &&
	"Notification" in window;

/**
 * iOS only allows Web Push from a **home-screen installed** PWA, and only from 16.4 up. Detecting
 * it is what lets the UI say "agrega la página a tu pantalla de inicio" instead of showing a
 * button that silently does nothing — the single most confusing Web Push failure there is.
 */
export function requiereInstalacionEnIOS(): boolean {
	if (typeof window === "undefined") return false;
	const esIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
	const instalada =
		window.matchMedia("(display-mode: standalone)").matches ||
		(navigator as { standalone?: boolean }).standalone === true;
	return esIOS && !instalada;
}

/** base64url VAPID key → the Uint8Array `pushManager.subscribe` wants. */
function claveABytes(base64url: string): Uint8Array<ArrayBuffer> {
	const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
	const bin = atob(base64);
	// Allocated over a plain ArrayBuffer on purpose: `applicationServerKey` wants a BufferSource
	// backed by one, and `Uint8Array.from` widens to ArrayBufferLike (which includes SharedArrayBuffer).
	const bytes = new Uint8Array(new ArrayBuffer(bin.length));
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

/** Was this subscription created with the key we are about to use? */
function mismaClave(sub: PushSubscription, clave: Uint8Array): boolean {
	const previa = sub.options?.applicationServerKey;
	// Older browsers do not expose `options`. Assume it matches rather than churning a working
	// subscription on every activation — a rotation is rare, a re-subscribe loop would not be.
	if (!previa) return true;
	const a = new Uint8Array(previa);
	return a.length === clave.length && a.every((b, i) => b === clave[i]);
}

const b64 = (buf: ArrayBuffer | null): string =>
	buf
		? btoa(String.fromCharCode(...new Uint8Array(buf)))
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/, "")
		: "";

/** "Chrome en Android" — what a person will recognise in their device list. */
export function etiquetaDelNavegador(): string {
	const ua = navigator.userAgent;
	const navegador = /Edg\//.test(ua)
		? "Edge"
		: /OPR\//.test(ua)
			? "Opera"
			: /Chrome\//.test(ua)
				? "Chrome"
				: /Firefox\//.test(ua)
					? "Firefox"
					: /Safari\//.test(ua)
						? "Safari"
						: "Navegador";
	const sistema = /Android/.test(ua)
		? "Android"
		: /iP(hone|ad|od)/.test(ua)
			? "iOS"
			: /Windows/.test(ua)
				? "Windows"
				: /Mac OS/.test(ua)
					? "Mac"
					: /Linux/.test(ua)
						? "Linux"
						: "";
	return sistema ? `${navegador} en ${sistema}` : navegador;
}

async function registrar(): Promise<ServiceWorkerRegistration> {
	// SvelteKit emits the worker as an ES module in dev and a classic script in the build. Getting
	// this wrong is a silent registration failure with no useful console message.
	const reg = await navigator.serviceWorker.register("/service-worker.js", {
		type: dev ? "module" : "classic",
	});
	await navigator.serviceWorker.ready;
	return reg;
}

/** Current state on this device. Never prompts — call this on load, `activar` on a click. */
export async function estadoActual(clavePublica: string): Promise<EstadoPush> {
	if (!soportaPush()) return "no-soportado";
	if (!clavePublica) return "sin-configurar";
	if (Notification.permission === "denied") return "bloqueado";
	if (Notification.permission === "default") return "sin-permiso";

	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	return sub ? "activo" : "inactivo";
}

export type Resultado = { estado: EstadoPush; mensaje?: string };

/**
 * Ask, subscribe, and register with the server.
 *
 * **Only ever call this from a user gesture.** Chrome ignores `Notification.requestPermission()`
 * outside one, and a prompt on page load is the fastest way to get permanently blocked — the
 * browser remembers "denied" and there is no second chance from inside the page.
 */
export async function activar(clavePublica: string, urlAlta = "/api/push"): Promise<Resultado> {
	if (!soportaPush()) {
		return {
			estado: "no-soportado",
			mensaje: requiereInstalacionEnIOS()
				? "En iPhone hay que agregar la página a la pantalla de inicio para recibir avisos."
				: "Este navegador no soporta avisos push. Los avisos siguen llegando dentro de la aplicación.",
		};
	}
	if (!clavePublica) {
		return { estado: "sin-configurar", mensaje: "Los avisos push no están configurados todavía." };
	}

	const permiso = await Notification.requestPermission();
	if (permiso === "denied") {
		return {
			estado: "bloqueado",
			mensaje:
				"Bloqueaste los avisos en este navegador. Puedes volver a activarlos desde la configuración del sitio.",
		};
	}
	if (permiso !== "granted") return { estado: "sin-permiso" };

	try {
		const reg = await registrar();
		const clave = claveABytes(clavePublica);

		// An existing subscription made with a DIFFERENT key cannot be reused: rotating the VAPID
		// pair invalidates every old one, and `subscribe` throws InvalidStateError rather than
		// replacing it. Reusing it blindly is worse than the throw — the device would look
		// subscribed and every push to it would be rejected by the push service, silently.
		let previa = await reg.pushManager.getSubscription();
		if (previa && !mismaClave(previa, clave)) {
			await previa.unsubscribe().catch(() => {});
			previa = null;
		}

		const sub =
			previa ??
			(await reg.pushManager.subscribe({
				userVisibleOnly: true, // required by Chrome; silent push is not allowed
				applicationServerKey: clave,
			}));

		const res = await fetch(urlAlta, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				endpoint: sub.endpoint,
				p256dh: b64(sub.getKey("p256dh")),
				auth: b64(sub.getKey("auth")),
				etiqueta: etiquetaDelNavegador(),
			}),
		});
		if (!res.ok) {
			const cuerpo = await res.json().catch(() => ({}));
			// The browser subscription exists but the server does not know about it — leaving it
			// would look "on" and deliver nothing.
			await sub.unsubscribe().catch(() => {});
			return { estado: "inactivo", mensaje: cuerpo.message ?? "No pudimos registrar este dispositivo." };
		}

		return { estado: "activo" };
	} catch (err) {
		return { estado: "inactivo", mensaje: explicarFalla(err) };
	}
}

/**
 * Turn the browser's own subscribe error into something a customer can act on.
 *
 * `pushManager.subscribe` fails with raw English strings from deep inside the browser, and the
 * most common one — "Registration failed - push service error" — is not about this site at all:
 * the browser could not register with ITS OWN push service (FCM for Chrome). Nothing on the server
 * changes that, so telling somebody "no pudimos registrar el dispositivo" sends them looking in the
 * wrong place. Chromium builds without Google's API keys, Brave with Google push messaging turned
 * off, and networks that block `fcm.googleapis.com` all land here.
 */
function explicarFalla(err: unknown): string {
	const crudo = err instanceof Error ? err.message : "";

	if (/push service error|Registration failed/i.test(crudo)) {
		return (
			"Tu navegador no pudo conectarse con su servicio de avisos. Suele pasar en Brave o Chromium " +
			"con los servicios de Google apagados, o en redes que los bloquean. Los avisos te siguen " +
			"llegando al abrir esta página."
		);
	}
	// A subscription made with a previous VAPID key blocks a new one with a different key.
	if (/different applicationServerKey|already exists/i.test(crudo)) {
		return "Este dispositivo tenía un registro viejo. Desactiva y vuelve a activar los avisos.";
	}
	if (/permission/i.test(crudo)) {
		return "El navegador no dio permiso para mostrar avisos.";
	}
	// Never the raw string: what is left here is English, written for whoever builds browsers, and
	// it names internals. It goes to the console for us and a sentence goes to the person.
	console.error("Push: fallo no reconocido al suscribir", err);
	return "No se pudieron activar los avisos en este dispositivo. Vuelve a intentarlo.";
}

/**
 * Turn push off on this device: unsubscribe locally AND drop the row, so nothing is orphaned.
 *
 * Nothing in the UI calls this — `PushToggle` only ever turns push ON, and a device is removed from
 * the panel's device list instead. Kept because doing only half of it is the failure mode: dropping
 * the row without unsubscribing leaves a browser subscription that reports "activo" and receives
 * nothing, and unsubscribing without dropping the row leaves us pushing at a dead endpoint until
 * the service answers 410.
 */
export async function desactivar(urlBaja = "/api/push"): Promise<Resultado> {
	if (!soportaPush()) return { estado: "no-soportado" };

	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	if (!sub) return { estado: "inactivo" };

	const sep = urlBaja.includes("?") ? "&" : "?";
	await fetch(`${urlBaja}${sep}endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" }).catch(() => {});
	await sub.unsubscribe().catch(() => {});
	return { estado: "inactivo" };
}
