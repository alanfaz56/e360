<script lang="ts">
	import StatCard from "$lib/components/StatCard.svelte";
	import BarList from "$lib/components/BarList.svelte";
	import type { getDashboardOperacion, getDashboardTiempos } from "$lib/server/dashboard/operacion";

	let {
		operacion,
		tiempos,
	}: {
		operacion: Awaited<ReturnType<typeof getDashboardOperacion>>;
		tiempos: Awaited<ReturnType<typeof getDashboardTiempos>>;
	} = $props();

	const bars = $derived(
		operacion.estados.map((e) => ({
			key: e.key,
			label: e.label,
			value: e.value,
			valueLabel: String(e.value),
			href: `/panel/notas?estado=${e.key}`,
		})),
	);
</script>

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Estado del taller</h2>
	<div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
		<StatCard label="Atrasadas" value={operacion.atrasadas} tone={operacion.atrasadas > 0 ? "danger" : "ok"} />
		<StatCard label="Esperando autorización" value={operacion.esperandoAutorizacion} tone="warn" />
		<StatCard label="Esperando refacción" value={operacion.esperandoRefaccion} tone="warn" />
		<StatCard label="Permanencia promedio" value={tiempos.permanenciaPromedio !== null ? `${tiempos.permanenciaPromedio} d` : "—"} />
	</div>
	<div class="rounded-lg border border-sand-200 bg-white p-4">
		<BarList {bars} />
	</div>
	{#if tiempos.recepcionEntrega.promedio !== null || tiempos.terminadoEntrega.promedio !== null}
		<div class="mt-3 grid gap-3 sm:grid-cols-2">
			{#if tiempos.recepcionEntrega.promedio !== null}
				<div class="rounded-lg border border-sand-200 bg-white p-3 text-sm">
					<p class="font-medium text-sand-700">Recepción → entrega</p>
					<p class="text-sand-500">
						Promedio {tiempos.recepcionEntrega.promedio} d · mediana {tiempos.recepcionEntrega.mediana} d · máx {tiempos.recepcionEntrega.max} d
					</p>
				</div>
			{/if}
			{#if tiempos.terminadoEntrega.promedio !== null}
				<div class="rounded-lg border border-sand-200 bg-white p-3 text-sm">
					<p class="font-medium text-sand-700">Terminado → entrega</p>
					<p class="text-sand-500">
						Promedio {tiempos.terminadoEntrega.promedio} d · mediana {tiempos.terminadoEntrega.mediana} d · máx {tiempos.terminadoEntrega.max} d
					</p>
				</div>
			{/if}
		</div>
	{/if}
</section>
