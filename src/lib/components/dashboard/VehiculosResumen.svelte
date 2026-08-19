<script lang="ts">
	import StatCard from "$lib/components/StatCard.svelte";
	import BarList from "$lib/components/BarList.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Skeleton from "$lib/components/Skeleton.svelte";
	import type { getDashboardVehiculos } from "$lib/server/dashboard/vehiculos";

	let { vehiculos }: { vehiculos: Promise<Awaited<ReturnType<typeof getDashboardVehiculos>>> } = $props();
</script>

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Vehículos</h2>
	{#await vehiculos}
		<Skeleton height="14rem" />
	{:then data}
		<div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
			<StatCard label="Unidades atendidas" value={data.unidadesAtendidas} />
			<StatCard label="Servicios realizados" value={data.servicios} />
			<StatCard label="Servicios por unidad" value={data.promedioServiciosPorUnidad ?? "—"} />
		</div>
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="rounded-lg border border-sand-200 bg-white p-4">
				<h3 class="mb-2 text-sm font-medium text-sand-700">Servicios por marca</h3>
				{#if data.marcas.length === 0}<p class="text-sm text-sand-500">Sin datos.</p>{:else}<BarList bars={data.marcas} />{/if}
			</div>
			<div>
				<h3 class="mb-2 text-sm font-medium text-sand-700">Mayor gasto acumulado</h3>
				{#if data.mayorGasto.length === 0}
					<EmptyState title="Sin datos" description="No hay ventas por unidad en este periodo." />
				{:else}
					<DataTable columns={["Vehículo", "Gasto"]} items={data.mayorGasto}>
						{#snippet row(v: (typeof data.mayorGasto)[number])}
							<td class="px-4 py-2 text-sand-700">{v.vehiculo}</td>
							<td class="px-4 py-2 tabular-nums">${v.gasto}</td>
						{/snippet}
					</DataTable>
				{/if}
			</div>
		</div>
	{:catch}
		<EmptyState title="No se pudo calcular" description="Intenta recargar la página." />
	{/await}
</section>
