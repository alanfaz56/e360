<script lang="ts">
	import StatCard from "$lib/components/StatCard.svelte";
	import BarList from "$lib/components/BarList.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Badge from "$lib/components/Badge.svelte";
	import { cotizacionEstadoTone, cotizacionEstadoLabel } from "$lib/comercial";
	import type { getDashboardCotizaciones } from "$lib/server/dashboard/cotizaciones";

	let { data }: { data: Awaited<ReturnType<typeof getDashboardCotizaciones>> } = $props();

	const bars = $derived(
		data.funnel.map((f) => ({ key: f.key, label: f.label, value: f.value, valueLabel: String(f.value) })),
	);
</script>

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Cotizaciones</h2>
	<div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
		<StatCard label="Cotizado" value={`$${data.kpis.cotizado}`} />
		<StatCard label="Autorizado" value={`$${data.kpis.autorizado}`} tone="ok" />
		<StatCard label="Rechazado" value={`$${data.kpis.rechazado}`} tone="danger" />
		<StatCard
			label="% autorización"
			value={data.kpis.porcentajeAutorizacion !== null ? `${data.kpis.porcentajeAutorizacion}%` : "—"}
		/>
	</div>
	<div class="mb-4 rounded-lg border border-sand-200 bg-white p-4">
		<BarList {bars} />
	</div>

	<h3 class="mb-2 text-sm font-medium text-sand-700">Cotizaciones pendientes</h3>
	{#if data.pendientes.length === 0}
		<EmptyState title="Sin pendientes" description="No hay cotizaciones esperando respuesta del cliente." />
	{:else}
		<DataTable columns={["Folio", "Cliente", "Unidad", "Importe", "Estado", "Días"]} items={data.pendientes}>
			{#snippet row(c: (typeof data.pendientes)[number])}
				<td class="px-4 py-2">
					<a class="font-medium text-brand-700 hover:underline" href="/panel/notas/{c.notaId}">#{c.folio}</a>
				</td>
				<td class="px-4 py-2 text-sand-700">{c.cliente}</td>
				<td class="px-4 py-2 text-sand-600">{c.unidad}</td>
				<td class="px-4 py-2 tabular-nums">${c.total}</td>
				<td class="px-4 py-2"><Badge tone={cotizacionEstadoTone(c.estado)}>{cotizacionEstadoLabel(c.estado)}</Badge></td>
				<td class="px-4 py-2 tabular-nums">{c.diasPendiente} d</td>
			{/snippet}
		</DataTable>
	{/if}
</section>
