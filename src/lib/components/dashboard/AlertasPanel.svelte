<script lang="ts">
	import Badge from "$lib/components/Badge.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import type { Alerta } from "$lib/server/dashboard/alertas";

	let { alertas }: { alertas: Alerta[] } = $props();
</script>

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Requiere atención</h2>
	{#if alertas.length === 0}
		<EmptyState title="Nada pendiente" description="No hay alertas activas en este momento." />
	{:else}
		<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
			{#each alertas as a (a.titulo)}
				<a
					href={a.href}
					class="block rounded-lg border border-sand-200 bg-white p-3 transition-colors hover:border-brand-600"
				>
					<Badge tone={a.severidad === "danger" ? "danger" : "warn"}>{a.titulo}</Badge>
					<p class="mt-1.5 text-sm text-sand-700">{a.descripcion}</p>
				</a>
			{/each}
		</div>
	{/if}
</section>
