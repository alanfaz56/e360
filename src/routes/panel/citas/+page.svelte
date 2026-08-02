<script lang="ts">
	import CalendarDays from "@lucide/svelte/icons/calendar-days";
	import CalendarPlus from "@lucide/svelte/icons/calendar-plus";
	import Search from "@lucide/svelte/icons/search";
	import Truck from "@lucide/svelte/icons/truck";
	import UserCheck from "@lucide/svelte/icons/user-check";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import { citaEstadoTone, franjaLabel } from "$lib/citas";
	import { fechaLarga, horaCorta } from "$lib/agenda";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data } = $props();

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const hayFiltros = $derived(Object.values(data.filtros).some(Boolean) || data.mias);
	const from = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const to = $derived(Math.min(data.page * data.perPage, data.total));

	// Only the day, without the weekday — the table already has a lot in each row.
	const dia = (fecha: string) => fechaLarga(fecha).replace(/^\w+, /, "");
</script>

<svelte:head><title>Citas — Estación 360</title></svelte:head>

<PageHeader title="Citas" description="Todas las citas y solicitudes, con filtros.">
	{#snippet actions()}
		<Button href="/panel" variant="outline">
			<CalendarDays size={18} aria-hidden="true" />
			Ver calendario
		</Button>
		{#if data.puede.crear}
			<Button href="/panel?drawer=nueva">
				<CalendarPlus size={18} aria-hidden="true" />
				Nueva cita
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<!-- Real GET form: the filters ARE the URL, so any view is shareable and works with JS off. -->
<form method="GET" class="mb-4 grid gap-3 rounded-lg border border-sand-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
	<Field label="Buscar" name="q" value={data.filtros.q} placeholder="Folio, nombre, teléfono, placas…" />
	<Field label="Estado" name="estado">
		{#snippet children(id)}
			<select {id} name="estado" class={INPUT}>
				<option value="">Todos</option>
				{#each data.estados as e (e.value)}
					<option value={e.value} selected={data.filtros.estado === e.value}>{e.label}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
	<Field label="Tipo" name="tipo">
		{#snippet children(id)}
			<select {id} name="tipo" class={INPUT}>
				<option value="">Todos</option>
				{#each data.tipos as t (t.value)}
					<option value={t.value} selected={data.filtros.tipo === t.value}>{t.label}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
	<Field label="Desde" name="desde" type="date" value={data.filtros.desde} />
	<Field label="Hasta" name="hasta" type="date" value={data.filtros.hasta} />

	<!-- Carried through the GET form so "solo las mías" survives a filter submit. -->
	{#if data.mias}<input type="hidden" name="mias" value="1" />{/if}

	<div class="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
		<Button size="sm">
			<Search size={16} aria-hidden="true" />
			Filtrar
		</Button>
		<Button
			href={searchHref(page.url, { mias: data.mias ? null : "1", page: null })}
			variant={data.mias ? "primary" : "ghost"}
			size="sm"
		>
			<UserCheck size={16} aria-hidden="true" />
			Solo las mías
		</Button>
		{#if hayFiltros}
			<Button href="/panel/citas" variant="ghost" size="sm">Limpiar filtros</Button>
		{/if}
		<span class="ml-auto text-sm text-sand-600">
			{#if data.total > 0}{from}–{to} de {data.total}{:else}Sin resultados{/if}
		</span>
	</div>
</form>

{#if data.citas.length === 0}
	<EmptyState
		title={hayFiltros ? "Ninguna cita coincide" : "Todavía no hay citas"}
		description={hayFiltros
			? "Prueba con otro rango de fechas o quita los filtros."
			: "Las solicitudes del formulario público y las citas del mostrador aparecen aquí."}
	>
		{#snippet icon()}<CalendarDays size={40} aria-hidden="true" />{/snippet}
	</EmptyState>
{:else}
	<DataTable columns={["Folio", "Cuándo", "Cliente", "Unidad", "Estado", "Asignada a", ""]} items={data.citas}>
		{#snippet row(cita)}
			<td class="px-4 py-2.5 font-medium text-sand-950">#{cita.folio}</td>
			<td class="px-4 py-2.5">
				<span class="block text-sand-950">{dia(cita.fecha)}</span>
				<span class="block text-xs text-sand-500">
					{#if cita.inicio}
						{horaCorta(new Date(cita.inicio))}
					{:else}
						Sin hora · pidió {franjaLabel(cita.franja)}
					{/if}
				</span>
			</td>
			<td class="px-4 py-2.5">
				<span class="block text-sand-950">{cita.nombre}</span>
				<span class="block text-xs text-sand-500">{cita.telefono}</span>
			</td>
			<td class="px-4 py-2.5">
				<span class="block text-sand-950">
					{[cita.marca, cita.modelo].filter(Boolean).join(" ") || "—"}
				</span>
				{#if cita.placas}<span class="block text-xs text-sand-500">{cita.placas}</span>{/if}
			</td>
			<td class="px-4 py-2.5">
				<span class="flex flex-wrap items-center gap-1.5">
					<Badge tone={citaEstadoTone(cita.estado)}>{cita.estadoLabel}</Badge>
					{#if cita.tipo === "recoleccion"}
						<Badge tone="brand"><Truck size={11} class="inline" aria-hidden="true" /> Recolección</Badge>
					{/if}
				</span>
			</td>
			<td class="px-4 py-2.5 text-sand-600">{cita.asignadoNombre ?? "—"}</td>
			<td class="px-4 py-2.5 text-right">
				<Button href="/panel/citas/{cita.id}" variant="ghost" size="sm">Ver</Button>
			</td>
		{/snippet}
	</DataTable>

	{#if data.totalPages > 1}
		<nav class="mt-4 flex items-center justify-between" aria-label="Paginación">
			{#if data.page > 1}
				<Button href={searchHref(page.url, { page: String(data.page - 1) })} variant="ghost" size="sm">
					<ChevronLeft size={16} aria-hidden="true" />
					Anterior
				</Button>
			{:else}<span></span>{/if}
			<span class="text-sm text-sand-600">Página {data.page} de {data.totalPages}</span>
			{#if data.page < data.totalPages}
				<Button href={searchHref(page.url, { page: String(data.page + 1) })} variant="ghost" size="sm">
					Siguiente
					<ChevronRight size={16} aria-hidden="true" />
				</Button>
			{:else}<span></span>{/if}
		</nav>
	{/if}
{/if}
