<script lang="ts">
	import StatCard from "$lib/components/StatCard.svelte";
	import BarList from "$lib/components/BarList.svelte";
	import TrendBars from "$lib/components/TrendBars.svelte";
	import Skeleton from "$lib/components/Skeleton.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import type { getDashboardCitas } from "$lib/server/dashboard/citas";

	let { citas }: { citas: Promise<Awaited<ReturnType<typeof getDashboardCitas>>> } = $props();
</script>

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Citas</h2>
	{#await citas}
		<Skeleton height="12rem" />
	{:then data}
		<div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
			<StatCard label="Conversión cita → nota" value={data.conversionCitaNota !== null ? `${data.conversionCitaNota}%` : "—"} />
			<StatCard label="No-show" value={data.noShowTasa !== null ? `${data.noShowTasa}%` : "—"} tone={data.noShowTasa && data.noShowTasa > 10 ? "warn" : "neutral"} />
		</div>
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="rounded-lg border border-sand-200 bg-white p-4">
				<h3 class="mb-2 text-sm font-medium text-sand-700">Por estado</h3>
				<BarList bars={data.porEstado.map((e) => ({ ...e, valueLabel: String(e.value) }))} />
			</div>
			<div class="rounded-lg border border-sand-200 bg-white p-4">
				<h3 class="mb-2 text-sm font-medium text-sand-700">Citas por día</h3>
				{#if data.diaria.length === 0}<p class="text-sm text-sand-500">Sin datos.</p>{:else}<TrendBars puntos={data.diaria} />{/if}
			</div>
		</div>
	{:catch}
		<EmptyState title="No se pudo calcular" description="Intenta recargar la página." />
	{/await}
</section>
