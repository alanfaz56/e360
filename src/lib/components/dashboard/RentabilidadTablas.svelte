<script lang="ts">
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Skeleton from "$lib/components/Skeleton.svelte";
	import type { getDashboardRentabilidad } from "$lib/server/dashboard/rentabilidad";

	let { rentabilidad }: { rentabilidad: Promise<Awaited<ReturnType<typeof getDashboardRentabilidad>>> } = $props();

	type Fila = { notaId: string; folio: number; cliente: string; venta: string; costo: string; utilidad: string; margen: number | null };
</script>

{#snippet tabla(titulo: string, filas: Fila[])}
	<h3 class="mb-2 text-sm font-medium text-sand-700">{titulo}</h3>
	{#if filas.length === 0}
		<EmptyState title="Sin datos" description="No hay notas facturadas en este periodo." />
	{:else}
		<DataTable columns={["Folio", "Cliente", "Venta", "Costo", "Utilidad", "Margen"]} items={filas}>
			{#snippet row(f: Fila)}
				<td class="px-4 py-2">
					<a class="font-medium text-brand-700 hover:underline" href="/panel/notas/{f.notaId}">#{f.folio}</a>
				</td>
				<td class="px-4 py-2 text-sand-700">{f.cliente}</td>
				<td class="px-4 py-2 tabular-nums">${f.venta}</td>
				<td class="px-4 py-2 tabular-nums">${f.costo}</td>
				<td class="px-4 py-2 tabular-nums">${f.utilidad}</td>
				<td class="px-4 py-2 tabular-nums">{f.margen !== null ? `${f.margen}%` : "—"}</td>
			{/snippet}
		</DataTable>
	{/if}
{/snippet}

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Rentabilidad por nota</h2>
	{#await rentabilidad}
		<Skeleton height="12rem" />
	{:then data}
		<div class="grid gap-4 lg:grid-cols-2">
			<div>{@render tabla("Menor margen", data.menorMargen)}</div>
			<div>{@render tabla("Mayor utilidad", data.mayorUtilidad)}</div>
		</div>
	{:catch}
		<EmptyState title="No se pudo calcular la rentabilidad" description="Intenta recargar la página." />
	{/await}
</section>
