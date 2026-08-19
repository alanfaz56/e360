<!-- Ventas/costos/utilidad por período. `TrendBars` only draws one series, so utilidad is the
     headline bar (hover/focus reads out all four numbers via `title`, same no-JS-required pattern
     as the home dashboard's chart) and the table underneath is the full per-period breakdown. -->
<script lang="ts">
	import TrendBars from "$lib/components/TrendBars.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import type { PuntoVentas } from "$lib/server/dashboard/ventas";

	let { puntos }: { puntos: PuntoVentas[] } = $props();

	const bars = $derived(
		puntos.map((p) => ({
			key: p.key,
			label: p.label,
			value: p.utilidad,
			valueLabel: `ventas ${p.ventasLabel}, costos ${p.costosLabel}, utilidad ${p.utilidadLabel}${p.margen !== null ? `, margen ${p.margen}%` : ""}`,
		})),
	);
</script>

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Ventas y utilidad</h2>
	{#if puntos.length === 0}
		<EmptyState title="Sin datos en este periodo" description="No hubo ventas facturadas en el rango seleccionado." />
	{:else}
		<div class="mb-3 rounded-lg border border-sand-200 bg-white p-4">
			<TrendBars puntos={bars} />
		</div>
		<DataTable columns={["Período", "Ventas", "Costos", "Utilidad", "Margen"]} items={puntos}>
			{#snippet row(p: PuntoVentas)}
				<td class="px-4 py-2 text-sand-600">{p.label}</td>
				<td class="px-4 py-2 tabular-nums">{p.ventasLabel}</td>
				<td class="px-4 py-2 tabular-nums">{p.costosLabel}</td>
				<td class="px-4 py-2 tabular-nums">{p.utilidadLabel}</td>
				<td class="px-4 py-2 tabular-nums">{p.margen !== null ? `${p.margen}%` : "—"}</td>
			{/snippet}
		</DataTable>
	{/if}
</section>
