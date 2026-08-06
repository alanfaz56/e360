/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/**
 * Service worker — push notifications ONLY.
 *
 * It deliberately caches nothing. Offline caching of an authenticated panel is its own decision
 * with its own failure mode (a stale cached page showing a vehicle as still in the shop), and
 * "we added a service worker for notifications" is not consent for it. `build` and `files` are
 * intentionally untouched.
 *
 * SvelteKit compiles this to /service-worker.js. `src/lib/push-cliente.ts` registers it.
 */

const sw = self as unknown as ServiceWorkerGlobalScope;

type Payload = {
	titulo?: string;
	cuerpo?: string;
	url?: string | null;
	evento?: string;
	id?: string;
	prioritario?: boolean;
};

/** Take over as soon as installed instead of waiting for every tab to close. */
sw.addEventListener("install", () => sw.skipWaiting());
sw.addEventListener("activate", (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener("push", (event) => {
	// A push with no readable body still gets shown: on some platforms the browser displays a
	// generic "site updated" notification if the handler shows nothing at all, which looks worse
	// than our own fallback.
	let datos: Payload = {};
	try {
		datos = (event.data?.json() as Payload) ?? {};
	} catch {
		datos = { cuerpo: event.data?.text() ?? "" };
	}

	const titulo = datos.titulo || "Estación 360";
	event.waitUntil(
		sw.registration.showNotification(titulo, {
			body: datos.cuerpo || "",
			icon: "/icon-192.png",
			badge: "/badge-72.png",
			// Group by event so ten payments in a row do not become ten separate banners; the
			// newest replaces the previous one.
			tag: datos.evento || "estacion360",
			renotify: Boolean(datos.prioritario),
			requireInteraction: Boolean(datos.prioritario),
			data: { url: datos.url ?? "/panel", id: datos.id ?? null },
		} as NotificationOptions),
	);
});

sw.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const destino = (event.notification.data as { url?: string })?.url ?? "/panel";

	event.waitUntil(
		(async () => {
			const abiertas = await sw.clients.matchAll({ type: "window", includeUncontrolled: true });

			// Focus a tab that is already on this origin and navigate it, rather than opening a
			// fourth copy of the panel every time somebody taps a notification.
			for (const cliente of abiertas) {
				if (new URL(cliente.url).origin === sw.location.origin) {
					await cliente.focus();
					if ("navigate" in cliente) await cliente.navigate(destino).catch(() => {});
					return;
				}
			}
			await sw.clients.openWindow(destino);
		})(),
	);
});

export {};
