<script lang="ts">
	import BarList from "$lib/components/BarList.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Skeleton from "$lib/components/Skeleton.svelte";
	import type { getDashboardCobranza } from "$lib/server/dashboard/cobranza";

	let { cobranza }: { cobranza: Promise<Awaited<ReturnType<typeof getDashboardCobranza>>> } = $props();
</script>

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Cobranza</h2>
	{#await cobranza}
		<Skeleton height="14rem" />
	{:then data}
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="rounded-lg border border-sand-200 bg-white p-4">
				<h3 class="mb-2 text-sm font-medium text-sand-700">Antigüedad de cartera</h3>
				<BarList bars={data.aging} />
			</div>
			<div>
				<h3 class="mb-2 text-sm font-medium text-sand-700">Top 10 clientes por deuda</h3>
				{#if data.deudores.length === 0}
					<EmptyState title="Sin cartera vencida" description="No hay facturas emitidas con saldo abierto." />
				{:else}
					<DataTable columns={["Cliente", "Facturas", "Saldo", "Vencido", "Días atraso"]} items={data.deudores}>
						{#snippet row(d: (typeof data.deudores)[number])}
							<td class="px-4 py-2 text-sand-700">{d.cliente}</td>
							<td class="px-4 py-2 tabular-nums">{d.facturas}</td>
							<td class="px-4 py-2 tabular-nums">${d.saldo}</td>
							<td class="px-4 py-2 tabular-nums">${d.vencido}</td>
							<td class="px-4 py-2 tabular-nums">{d.diasMaxAtraso > 0 ? `${d.diasMaxAtraso} d` : "—"}</td>
						{/snippet}
					</DataTable>
				{/if}
			</div>
		</div>
	{:catch}
		<EmptyState title="No se pudo calcular la cobranza" description="Intenta recargar la página." />
	{/await}
</section>
