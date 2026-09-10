<!--
	A saved AI report, on its own page — nothing else here to accidentally print. Same
	print-to-PDF pattern as DocumentoImprimible.svelte: `@media print` strips the panel chrome,
	the browser's print dialog produces the file.
-->
<script lang="ts">
	import Printer from "@lucide/svelte/icons/printer";
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import Button from "$lib/components/Button.svelte";
	import Logo from "$lib/components/Logo.svelte";
	import { page } from "$app/state";
	import { renderNarrativaMarkdown } from "$lib/markdown-simple";

	let { data } = $props();
	const r = $derived(data.reporte);
</script>

<svelte:head><title>Reporte de nota #{r.nota.folio} — Estación 360</title></svelte:head>

<div class="mx-auto max-w-3xl">
	<div class="no-imprimir mb-4 flex flex-wrap items-center gap-2">
		<Button
			href="/panel/notas/{page.params.id}"
			variant="ghost"
		>
			<ArrowLeft
				size={16}
				aria-hidden="true"
			/>
			Volver a la nota
		</Button>
		<Button onclick={() => window.print()}>
			<Printer
				size={18}
				aria-hidden="true"
			/>
			Imprimir o guardar como PDF
		</Button>
		<span class="text-xs text-sand-500">
			En el diálogo de impresión elige «Guardar como PDF» — así sale el archivo, sin instalar nada.
		</span>
	</div>

	<article class="documento rounded-lg border border-sand-200 bg-white p-8 text-sand-900">
		<header class="flex flex-wrap items-start justify-between gap-4 border-b border-sand-300 pb-4">
			<div>
				<Logo
					variant="black"
					class="h-10 w-auto"
				/>
				<p class="mt-1 text-sm text-sand-600">Taller mecánico</p>
			</div>
			<div class="text-right">
				<p class="font-display text-xl text-sand-950">Reporte de servicio</p>
				<p class="text-sand-700">Folio #{r.nota.folio}</p>
				<p class="text-sm text-sand-500">{r.estadoLabel}</p>
				<p class="text-xs text-sand-400">
					{new Date(r.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
				</p>
			</div>
		</header>

		<div class="reporte-narrativa mt-4 text-sm leading-relaxed text-sand-800">
			{@html renderNarrativaMarkdown(r.narrativa)}
		</div>

		{#if r.cotizaciones.length > 0}
			<div class="mt-6 border-t border-sand-200 pt-4">
				<p class="mb-2 text-sm font-medium text-sand-700">Cotizaciones incluidas</p>
				<ul class="space-y-1 text-sm text-sand-700">
					{#each r.cotizaciones as c (c.folio)}
						<li>Cotización #{c.folio} · {c.estadoLabel} · {c.total}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if r.fotos.length > 0}
			<div class="mt-6 border-t border-sand-200 pt-4">
				<p class="mb-2 text-sm font-medium text-sand-700">Fotografías</p>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{#each r.fotos as f (f.id)}
						<img
							src={f.url}
							alt={f.nombre}
							class="aspect-square w-full rounded border border-sand-200 object-cover"
						/>
					{/each}
				</div>
			</div>
		{/if}
	</article>
</div>

<style>
	.reporte-narrativa :global(p) {
		margin: 0 0 0.75em;
	}
	.reporte-narrativa :global(h1),
	.reporte-narrativa :global(h2),
	.reporte-narrativa :global(h3),
	.reporte-narrativa :global(h4) {
		margin: 1.25em 0 0.5em;
		font-weight: 600;
		color: var(--color-sand-950, #1c1917);
	}
	.reporte-narrativa :global(h1) {
		font-size: 1.15rem;
	}
	.reporte-narrativa :global(h2),
	.reporte-narrativa :global(h3) {
		font-size: 1rem;
	}
	.reporte-narrativa :global(ul) {
		margin: 0 0 0.75em;
		padding-left: 1.25em;
		list-style: disc;
	}
	.reporte-narrativa :global(li) {
		margin: 0.15em 0;
	}
	.reporte-narrativa :global(hr) {
		margin: 1em 0;
		border: 0;
		border-top: 1px solid var(--color-sand-200, #e7e5e4);
	}
	.reporte-narrativa :global(strong) {
		font-weight: 600;
		color: var(--color-sand-950, #1c1917);
	}

	@media print {
		:global(body) {
			background: white;
		}
		:global(aside),
		:global(nav),
		:global(header.panel),
		.no-imprimir {
			display: none !important;
		}
		:global(main) {
			padding: 0 !important;
			margin: 0 !important;
			max-width: none !important;
		}
		.documento {
			border: 0;
			padding: 0;
		}
		img {
			break-inside: avoid;
		}
	}
</style>
