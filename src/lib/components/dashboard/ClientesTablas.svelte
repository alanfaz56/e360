<script lang="ts">
	import StatCard from "$lib/components/StatCard.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Skeleton from "$lib/components/Skeleton.svelte";
	import type { getDashboardClientes } from "$lib/server/dashboard/clientes";

	let { clientes }: { clientes: Promise<Awaited<ReturnType<typeof getDashboardClientes>>> } = $props();
</script>

{#snippet tablaTop(titulo: string, filas: { clienteId: string; cliente: string; venta?: string; utilidad?: string }[], columna: string)}
	<h3 class="mb-2 text-sm font-medium text-sand-700">{titulo}</h3>
	{#if filas.length === 0}
		<EmptyState title="Sin datos" description="No hay facturación en este periodo." />
	{:else}
		<DataTable columns={["Cliente", columna]} items={filas}>
			{#snippet row(c: (typeof filas)[number])}
				<td class="px-4 py-2 text-sand-700">{c.cliente}</td>
				<td class="px-4 py-2 tabular-nums">${c.venta ?? c.utilidad}</td>
			{/snippet}
		</DataTable>
	{/if}
{/snippet}

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Clientes</h2>
	{#await clientes}
		<Skeleton height="14rem" />
	{:then data}
		<div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
			<StatCard label="Activos" value={data.activos} />
			<StatCard label="Nuevos" value={data.nuevos} />
			<StatCard label="Recurrentes" value={data.recurrentes} />
			<StatCard label="Ticket promedio" value={data.ticketPromedio !== null ? `$${data.ticketPromedio}` : "—"} />
		</div>
		<div class="grid gap-4 lg:grid-cols-2">
			<div>{@render tablaTop("Top por venta", data.topVenta, "Venta")}</div>
			<div>{@render tablaTop("Top por utilidad", data.topUtilidad, "Utilidad")}</div>
		</div>
	{:catch}
		<EmptyState title="No se pudo calcular" description="Intenta recargar la página." />
	{/await}
</section>
