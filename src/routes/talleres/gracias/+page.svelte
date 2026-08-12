<script lang="ts">
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import Phone from "@lucide/svelte/icons/phone";
	import Button from "$lib/components/Button.svelte";
	import { telHref, telefonoFormato, waHref } from "$lib/empresa";

	let { data } = $props();
</script>

<svelte:head>
	<title>Solicitud recibida — Estación 360</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="flex min-h-svh items-center justify-center bg-sand-100 px-4 py-12">
	<div class="w-full max-w-md rounded-lg border border-sand-200 bg-white p-8 text-center">
		<CircleCheck size={44} class="mx-auto text-ok" aria-hidden="true" />
		<h1 class="font-display mt-4 text-3xl text-sand-950">Recibimos tu solicitud</h1>
		<p class="mt-3 leading-relaxed text-sand-600">
			Una persona del equipo la va a revisar. Te llamamos al teléfono que nos diste para conocerlos
			y, si todo cuadra, pasamos a ver el taller.
		</p>

		<div class="mt-5 rounded-lg border border-brand-200 bg-brand-50 p-4 text-left text-sm text-sand-800">
			<p class="flex items-center gap-2 font-bold">
				<Phone size={16} aria-hidden="true" />
				No hay nada que pagar
			</p>
			<p class="mt-1 leading-relaxed">
				Registrarse es gratis y no cobramos por aparecer en la red. Si alguien te pide dinero a
				nombre de Estación 360, háblanos antes.
			</p>
		</div>

		{#if telHref(data.empresa.telefono) || waHref(data.empresa.telefono)}
			<div class="mt-5 flex flex-wrap justify-center gap-3">
				{#if waHref(data.empresa.telefono)}
					<Button href={waHref(data.empresa.telefono)}>WhatsApp</Button>
				{/if}
				{#if telHref(data.empresa.telefono)}
					<Button href={telHref(data.empresa.telefono)} variant="outline">
						<Phone size={18} aria-hidden="true" />
						{telefonoFormato(data.empresa.telefono)}
					</Button>
				{/if}
			</div>
		{/if}

		<div class="mt-6 border-t border-sand-200 pt-5">
			<Button href="/" variant="ghost" size="sm">Volver al inicio</Button>
		</div>
	</div>
</main>
