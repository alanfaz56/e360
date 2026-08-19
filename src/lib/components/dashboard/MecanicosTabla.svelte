<script lang="ts">
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Skeleton from "$lib/components/Skeleton.svelte";
	import type { getDashboardMecanicos } from "$lib/server/dashboard/mecanicos";

	let { mecanicos }: { mecanicos: Promise<Awaited<ReturnType<typeof getDashboardMecanicos>>> } = $props();
</script>

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Desempeño operativo — mecánicos</h2>
	{#await mecanicos}
		<Skeleton height="10rem" />
	{:then data}
		{#if data.length === 0}
			<EmptyState title="Sin mecánicos asignados" description="No hay trabajos asignados en este periodo." />
		{:else}
			<DataTable columns={["Mecánico", "Asignados", "Terminados", "Abiertos", "Venta", "Costo", "Utilidad"]} items={data}>
				{#snippet row(m: (typeof data)[number])}
					<td class="px-4 py-2 text-sand-700">{m.nombre}</td>
					<td class="px-4 py-2 tabular-nums">{m.asignados}</td>
					<td class="px-4 py-2 tabular-nums">{m.terminados}</td>
					<td class="px-4 py-2 tabular-nums">{m.abiertos}</td>
					<td class="px-4 py-2 tabular-nums">${m.venta}</td>
					<td class="px-4 py-2 tabular-nums">${m.costo}</td>
					<td class="px-4 py-2 tabular-nums">${m.utilidad}</td>
				{/snippet}
			</DataTable>
		{/if}
	{:catch}
		<EmptyState title="No se pudo calcular" description="Intenta recargar la página." />
	{/await}
</section>
