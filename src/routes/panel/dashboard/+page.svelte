<script lang="ts">
	import Search from "@lucide/svelte/icons/search";
	import Button from "$lib/components/Button.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import ResumenKpis from "$lib/components/dashboard/ResumenKpis.svelte";
	import AlertasPanel from "$lib/components/dashboard/AlertasPanel.svelte";
	import OperacionEstado from "$lib/components/dashboard/OperacionEstado.svelte";
	import VentasChart from "$lib/components/dashboard/VentasChart.svelte";
	import CobranzaAging from "$lib/components/dashboard/CobranzaAging.svelte";
	import CotizacionesFunnel from "$lib/components/dashboard/CotizacionesFunnel.svelte";
	import RentabilidadTablas from "$lib/components/dashboard/RentabilidadTablas.svelte";
	import InventarioResumen from "$lib/components/dashboard/InventarioResumen.svelte";
	import MecanicosTabla from "$lib/components/dashboard/MecanicosTabla.svelte";
	import TalleresRanking from "$lib/components/dashboard/TalleresRanking.svelte";
	import ClientesTablas from "$lib/components/dashboard/ClientesTablas.svelte";
	import VehiculosResumen from "$lib/components/dashboard/VehiculosResumen.svelte";
	import CitasChart from "$lib/components/dashboard/CitasChart.svelte";
	import GarantiasResumen from "$lib/components/dashboard/GarantiasResumen.svelte";

	let { data } = $props();

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";
</script>

<svelte:head><title>Dashboard gerencial — Estación 360</title></svelte:head>

<PageHeader title="Dashboard gerencial" description="La situación del taller: dinero, operación y problemas, primero." />

<!-- Real GET form: los filtros SON la URL, así cualquier vista es compartible y funciona sin JS. -->
<form method="GET" class="mb-6 grid gap-3 rounded-lg border border-sand-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
	<Field label="Rango" name="rango">
		{#snippet children(id)}
			<select {id} name="rango" class={INPUT}>
				{#each data.rangoOpciones as r (r.value)}
					<option value={r.value} selected={data.periodo.rango === r.value}>{r.label}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
	{#if data.periodo.rango === "personalizado"}
		<Field label="Desde" name="desde" type="date" value={data.periodo.desde} />
		<Field label="Hasta" name="hasta" type="date" value={data.periodo.hasta} />
	{/if}
	<Field label="Taller" name="taller">
		{#snippet children(id)}
			<select {id} name="taller" class={INPUT}>
				<option value="">Todos</option>
				{#each data.talleresOpciones as t (t.id)}
					<option value={t.id} selected={data.filtros.taller === t.id}>{t.nombre}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
	<Field label="Mecánico" name="mecanico">
		{#snippet children(id)}
			<select {id} name="mecanico" class={INPUT}>
				<option value="">Todos</option>
				{#each data.mecanicosOpciones as m (m.id)}
					<option value={m.id} selected={data.filtros.mecanico === m.id}>{m.name}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
	<div class="flex items-end sm:col-span-2 lg:col-span-5">
		<Button size="sm"><Search size={16} aria-hidden="true" />Filtrar</Button>
	</div>
</form>

<ResumenKpis resumen={data.resumen} />
<AlertasPanel alertas={data.alertas} />
<OperacionEstado operacion={data.operacion} tiempos={data.tiempos} />
<VentasChart puntos={data.ventas} />
<CobranzaAging cobranza={data.cobranza} />
<CotizacionesFunnel data={data.cotizaciones} />
<RentabilidadTablas rentabilidad={data.rentabilidad} />
<InventarioResumen inventario={data.inventario} />
<MecanicosTabla mecanicos={data.mecanicos} />
<TalleresRanking talleres={data.talleres} />
<ClientesTablas clientes={data.clientes} />
<VehiculosResumen vehiculos={data.vehiculos} />
<CitasChart citas={data.citas} />
<GarantiasResumen garantias={data.garantias} />
