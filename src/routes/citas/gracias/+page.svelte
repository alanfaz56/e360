<script lang="ts">
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import Phone from "@lucide/svelte/icons/phone";
	import Button from "$lib/components/Button.svelte";
	import { page } from "$app/state";

	const folio = $derived(page.url.searchParams.get("folio"));
</script>

<svelte:head>
	<title>Solicitud recibida — Estación 360</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="flex min-h-svh items-center justify-center bg-sand-100 px-4 py-12">
	<div class="w-full max-w-md rounded-lg border border-sand-200 bg-white p-8 text-center">
		<CircleCheck size={44} class="mx-auto text-ok" aria-hidden="true" />
		<h1 class="font-display mt-4 text-3xl text-sand-950">Solicitud recibida</h1>

		{#if folio}
			<p class="mt-4 text-sand-600">Tu folio es</p>
			<p class="font-display text-4xl text-brand-600">#{folio}</p>
			<p class="mt-1 text-xs text-sand-500">Tenlo a la mano si nos llamas.</p>
		{/if}

		<div class="mt-5 rounded-lg border border-brand-200 bg-brand-50 p-4 text-left text-sm text-sand-800">
			<p class="flex items-center gap-2 font-bold">
				<Phone size={16} aria-hidden="true" />
				Te confirmamos antes de cualquier cosa
			</p>
			<p class="mt-1 leading-relaxed">
				Nos comunicamos contigo por teléfono, WhatsApp o correo para confirmar la hora y el
				servicio. Tu cita no es definitiva hasta que hablemos.
			</p>
		</div>

		<p class="mt-4 text-sm text-sand-600">¿Prefieres confirmarla ahora mismo?</p>
		<div class="mt-3 flex flex-wrap justify-center gap-3">
			<Button href="tel:+526621234567">
				<Phone size={18} aria-hidden="true" />
				Llamar al taller
			</Button>
			<Button href="https://wa.me/526621234567" variant="outline">WhatsApp</Button>
		</div>

		<div class="mt-6 flex flex-wrap justify-center gap-3 border-t border-sand-200 pt-5">
			<Button href="/" variant="ghost" size="sm">Volver al inicio</Button>
			<Button href="/citas" variant="ghost" size="sm">Agendar otra</Button>
		</div>
	</div>
</main>
