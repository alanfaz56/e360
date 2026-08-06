<!--
	Turn browser notifications on for THIS device.

	Only ever prompts from a click. A permission prompt on page load is the fastest way to get
	permanently blocked — the browser remembers the "no" and nothing in the page can ask again.
	So the button explains what it is for first, and the OS prompt only appears after a tap.

	Every failure mode gets its own sentence, because "nothing happened" is the normal Web Push
	experience otherwise: unsupported browser, iOS needing the home-screen install, the person
	having said no, and push simply not being configured on the server are four different
	situations with four different things to do about them.
-->
<script lang="ts">
	import Bell from "@lucide/svelte/icons/bell";
	import BellRing from "@lucide/svelte/icons/bell-ring";
	import Info from "@lucide/svelte/icons/info";
	import Button from "./Button.svelte";
	import { activar, estadoActual, requiereInstalacionEnIOS, type EstadoPush } from "$lib/push-cliente";

	let {
		clavePublica = "",
		endpoint = "/api/push",
		compacto = false,
	}: { clavePublica?: string; endpoint?: string; compacto?: boolean } = $props();

	let estado = $state<EstadoPush | null>(null);
	let mensaje = $state<string | null>(null);
	let trabajando = $state(false);

	// `$effect` never runs during SSR, so a no-JS visitor simply never sees the control — which is
	// correct: push cannot work without JavaScript, and a dead button is worse than no button.
	$effect(() => {
		estadoActual(clavePublica).then((e) => (estado = e));
	});

	async function encender() {
		trabajando = true;
		mensaje = null;
		const res = await activar(clavePublica, endpoint);
		estado = res.estado;
		mensaje = res.mensaje ?? null;
		trabajando = false;
	}

	const AYUDA: Partial<Record<EstadoPush, string>> = {
		"no-soportado": "Este navegador no puede mostrar avisos. Los verás igual al abrir la página.",
		"sin-configurar": "Los avisos en el navegador no están configurados todavía.",
		bloqueado:
			"Bloqueaste los avisos para este sitio. Actívalos desde el candado de la barra de direcciones y vuelve a intentar.",
	};

	const puedeActuar = $derived(estado === "sin-permiso" || estado === "inactivo");
</script>

{#if estado !== null}
	<div class="space-y-2">
		<!--
			Already on: say so and stop. Offering "desactivar" next to it turns a settled thing back
			into a decision every time the page is opened — and it is not this page's switch anyway.
			The panel's device list is where a device gets removed; a customer uses the browser's own
			site settings, which is the control they can always reach whatever we render.
		-->
		{#if estado === "activo"}
			<p class="flex items-center gap-1.5 text-xs text-sand-600">
				<BellRing
					size={14}
					aria-hidden="true"
					class="shrink-0 text-ok"
				/>
				Este dispositivo ya recibe avisos.
			</p>
		{:else if puedeActuar}
			<Button
				type="button"
				onclick={encender}
				disabled={trabajando}
				size={compacto ? "sm" : "md"}
				full={!compacto}
			>
				<Bell
					size={18}
					aria-hidden="true"
				/>
				Activar avisos en este dispositivo
			</Button>
		{:else}
			<p class="flex items-start gap-2 rounded border border-sand-200 bg-sand-50 px-3 py-2 text-xs text-sand-600">
				<Info
					size={14}
					aria-hidden="true"
					class="mt-0.5 shrink-0"
				/>
				<span>
					{AYUDA[estado] ?? "Los avisos no están disponibles aquí."}
					{#if estado === "no-soportado" && requiereInstalacionEnIOS()}
						<br />
						En iPhone: toca <strong>Compartir → Agregar a pantalla de inicio</strong> y ábrela desde ahí.
					{/if}
				</span>
			</p>
		{/if}

		{#if mensaje}
			<p
				role="status"
				class="text-xs text-sand-600"
			>
				{mensaje}
			</p>
		{/if}
	</div>
{/if}
