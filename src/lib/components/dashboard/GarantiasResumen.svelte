<script lang="ts">
	import StatCard from "$lib/components/StatCard.svelte";
	import TrendBars from "$lib/components/TrendBars.svelte";
	import Skeleton from "$lib/components/Skeleton.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import type { getDashboardGarantias } from "$lib/server/dashboard/garantias";

	let { garantias }: { garantias: Promise<Awaited<ReturnType<typeof getDashboardGarantias>>> } = $props();
</script>

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Garantías</h2>
	{#await garantias}
		<Skeleton height="10rem" />
	{:then data}
		<div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
			<StatCard label="Trabajos de garantía" value={data.trabajosGarantia} tone={data.trabajosGarantia > 0 ? "warn" : "neutral"} />
			<StatCard label="% que regresan" value={data.porcentajeQueRegresan !== null ? `${data.porcentajeQueRegresan}%` : "—"} />
			<StatCard label="Costo asociado" value={`$${data.costoAsociado}`} />
			<StatCard label="Tiempo promedio" value={data.tiempoPromedioDias !== null ? `${data.tiempoPromedioDias} d` : "—"} />
		</div>
		{#if data.chart.length > 0}
			<div class="rounded-lg border border-sand-200 bg-white p-4">
				<TrendBars puntos={data.chart} />
			</div>
		{/if}
	{:catch}
		<EmptyState title="No se pudo calcular" description="Intenta recargar la página." />
	{/await}
</section>
