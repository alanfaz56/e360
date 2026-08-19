<script lang="ts">
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Skeleton from "$lib/components/Skeleton.svelte";
	import type { getDashboardTalleres } from "$lib/server/dashboard/talleres";

	let { talleres }: { talleres: Promise<Awaited<ReturnType<typeof getDashboardTalleres>>> } = $props();
</script>

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Talleres externos</h2>
	{#await talleres}
		<Skeleton height="10rem" />
	{:then data}
		{#if data.length === 0}
			<EmptyState title="Sin talleres externos" description="No hay talleres aliados registrados." />
		{:else}
			<DataTable columns={["Taller", "Enviados", "Fuera ahora", "Costo externo", "Días fuera (prom.)", "QA aprobado"]} items={data}>
				{#snippet row(t: (typeof data)[number])}
					<td class="px-4 py-2 text-sand-700">{t.nombre}</td>
					<td class="px-4 py-2 tabular-nums">{t.enviados}</td>
					<td class="px-4 py-2 tabular-nums">{t.fueraActualmente}</td>
					<td class="px-4 py-2 tabular-nums">${t.costoExterno}</td>
					<td class="px-4 py-2 tabular-nums">{t.tiempoFueraPromedio !== null ? `${t.tiempoFueraPromedio} d` : "—"}</td>
					<td class="px-4 py-2 tabular-nums">{t.qaAprobadoTasa !== null ? `${t.qaAprobadoTasa}%` : "—"}</td>
				{/snippet}
			</DataTable>
		{/if}
	{:catch}
		<EmptyState title="No se pudo calcular" description="Intenta recargar la página." />
	{/await}
</section>
