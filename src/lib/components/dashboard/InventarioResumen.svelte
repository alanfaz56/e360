<script lang="ts">
	import StatCard from "$lib/components/StatCard.svelte";
	import BarList from "$lib/components/BarList.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import type { getDashboardInventario } from "$lib/server/dashboard/inventario";

	let { inventario }: { inventario: Awaited<ReturnType<typeof getDashboardInventario>> } = $props();

	const entradas = $derived(inventario.entradasVsSalidas.map((d) => ({ key: d.key, label: d.label, value: d.entradas, valueLabel: String(d.entradas) })));
	const salidas = $derived(inventario.entradasVsSalidas.map((d) => ({ key: d.key, label: d.label, value: d.salidas, valueLabel: String(d.salidas) })));
	const topProductos = $derived(inventario.topProductos.map((p) => ({ key: p.productoId, label: p.nombre, value: Number(p.cantidad), valueLabel: p.cantidad })));
</script>

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Inventario</h2>
	<div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
		<StatCard label="Valor en existencia" value={`$${inventario.valorEnExistencia}`} />
		<StatCard label="Con existencia" value={inventario.productosConExistencia} />
		<StatCard label="Bajo mínimo" value={inventario.bajoMinimo.length} tone={inventario.bajoMinimo.length > 0 ? "warn" : "ok"} />
		<StatCard label="Solicitudes pendientes" value={inventario.solicitudesPendientes} tone={inventario.solicitudesPendientes > 0 ? "warn" : "neutral"} />
		<StatCard label="Consumo del período" value={`$${inventario.consumoPeriodo}`} />
	</div>

	<div class="mb-4 grid gap-4 lg:grid-cols-2">
		<div class="rounded-lg border border-sand-200 bg-white p-4">
			<h3 class="mb-2 text-sm font-medium text-sand-700">Entradas</h3>
			{#if entradas.length === 0}<p class="text-sm text-sand-500">Sin movimientos.</p>{:else}<BarList bars={entradas} />{/if}
		</div>
		<div class="rounded-lg border border-sand-200 bg-white p-4">
			<h3 class="mb-2 text-sm font-medium text-sand-700">Salidas</h3>
			{#if salidas.length === 0}<p class="text-sm text-sand-500">Sin movimientos.</p>{:else}<BarList bars={salidas} />{/if}
		</div>
	</div>

	<div class="mb-4">
		<h3 class="mb-2 text-sm font-medium text-sand-700">Productos más utilizados</h3>
		{#if topProductos.length === 0}
			<EmptyState title="Sin salidas" description="No hubo consumo de inventario en este periodo." />
		{:else}
			<div class="rounded-lg border border-sand-200 bg-white p-4"><BarList bars={topProductos} /></div>
		{/if}
	</div>

	<div>
		<h3 class="mb-2 text-sm font-medium text-sand-700">Bajo mínimo</h3>
		{#if inventario.bajoMinimo.length === 0}
			<EmptyState title="Todo en orden" description="Ningún producto está por debajo de su mínimo." />
		{:else}
			<DataTable columns={["SKU", "Producto", "Existencia", "Mínimo", "Diferencia"]} items={inventario.bajoMinimo}>
				{#snippet row(p: (typeof inventario.bajoMinimo)[number])}
					<td class="px-4 py-2 text-sand-500">{p.sku ?? "—"}</td>
					<td class="px-4 py-2 text-sand-700">{p.nombre}</td>
					<td class="px-4 py-2 tabular-nums">{p.existencia}</td>
					<td class="px-4 py-2 tabular-nums">{p.minimo}</td>
					<td class="px-4 py-2 tabular-nums text-danger">{p.diferencia}</td>
				{/snippet}
			</DataTable>
		{/if}
	</div>
</section>
