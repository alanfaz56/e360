<!--
	The page shown when a load or a route throws — the last thing between a failure and a blank
	screen. Without it SvelteKit renders its own, in English, and in dev with a stack trace on it.

	The message comes from `handleError` in hooks.server.ts, which already decided what a person may
	read: a Spanish sentence written for them, or a generic one plus the reference that finds the
	real error in the log. Nothing here re-derives it, and nothing here shows `$page.error` raw.
-->
<script lang="ts">
	import Home from "@lucide/svelte/icons/home";
	import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
	import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
	import Button from "$lib/components/Button.svelte";
	import { page } from "$app/state";

	// 404 gets its own copy: "no existe" and "se rompió" are different news and lead somewhere
	// different. Everything else falls back to the message the server chose.
	const esNoEncontrado = $derived(page.status === 404);
	const titulo = $derived(esNoEncontrado ? "Esta página no existe" : "Algo salió mal");
	const mensaje = $derived(
		esNoEncontrado
			? "Puede que el enlace esté mal escrito, o que lo que buscabas ya no esté."
			: (page.error?.message ?? "No pudimos completar la operación."),
	);
	const referencia = $derived(page.error?.ref ?? null);
</script>

<svelte:head><title>{titulo} — Estación 360</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center px-4 text-center">
	<TriangleAlert
		size={40}
		aria-hidden="true"
		class="text-danger"
	/>
	<h1 class="mt-4 font-display text-2xl text-sand-950">{titulo}</h1>
	<p class="mt-2 text-sand-700">{mensaje}</p>

	{#if referencia}
		<!-- The one thing worth reading out over the phone: it is what finds the error in the log. -->
		<p class="mt-3 text-sm text-sand-500">
			Referencia <span class="font-mono font-medium text-sand-700">{referencia}</span>
		</p>
	{/if}

	<div class="mt-6 flex flex-wrap justify-center gap-2">
		<Button
			href={page.url.pathname}
			variant="outline"
		>
			<RotateCcw
				size={18}
				aria-hidden="true"
			/>
			Reintentar
		</Button>
		<Button href="/panel">
			<Home
				size={18}
				aria-hidden="true"
			/>
			Ir al inicio
		</Button>
	</div>
</main>
