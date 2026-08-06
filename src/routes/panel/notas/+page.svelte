<script lang="ts">
	import ClipboardList from "@lucide/svelte/icons/clipboard-list";
	import Search from "@lucide/svelte/icons/search";
	import Wrench from "@lucide/svelte/icons/wrench";
	import Camera from "@lucide/svelte/icons/camera";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import { notaEstadoTone } from "$lib/notas";
	import { fechaLarga } from "$lib/agenda";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data } = $props();

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const hayFiltros = $derived(Boolean(data.filtros.q || data.filtros.estado || data.filtros.abiertas));
	const from = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const to = $derived(Math.min(data.page * data.perPage, data.total));

	const dia = (iso: string) => fechaLarga(iso.slice(0, 10)).replace(/^\w+, /, "");
</script>

<svelte:head><title>Notas de servicio — Estación 360</title></svelte:head>

<PageHeader
	title="Notas de servicio"
	description="Las unidades que están —o estuvieron— en el taller."
>
	{#snippet actions()}
		<Button
			href={searchHref(page.url, { abiertas: data.filtros.abiertas ? null : "1", page: null })}
			variant={data.filtros.abiertas ? "primary" : "outline"}
		>
			Solo abiertas
		</Button>
	{/snippet}
</PageHeader>

<!-- Real GET form: the filters ARE the URL, so any view is shareable and works with JS off. -->
<form
	method="GET"
	class="mb-4 grid gap-3 rounded-lg border border-sand-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
>
	<Field
		label="Buscar"
		name="q"
		value={data.filtros.q}
		placeholder="Folio, cliente, placas, VIN, económico…"
	/>
	<Field
		label="Estado"
		name="estado"
	>
		{#snippet children(id)}
			<select
				{id}
				name="estado"
				class={INPUT}
			>
				<option value="">Todos</option>
				{#each data.estados as e (e.value)}
					<option
						value={e.value}
						selected={data.filtros.estado === e.value}>{e.label}</option
					>
				{/each}
			</select>
		{/snippet}
	</Field>
	{#if data.filtros.abiertas}<input
			type="hidden"
			name="abiertas"
			value="1"
		/>{/if}

	<div class="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
		<Button size="sm">
			<Search
				size={16}
				aria-hidden="true"
			/>
			Filtrar
		</Button>
		{#if hayFiltros}
			<Button
				href="/panel/notas"
				variant="ghost"
				size="sm">Limpiar filtros</Button
			>
		{/if}
		<span class="ml-auto text-sm text-sand-600">
			{#if data.total > 0}{from}–{to} de {data.total}{:else}Sin resultados{/if}
		</span>
	</div>
</form>

{#if data.notas.length === 0}
	<EmptyState
		title={hayFiltros ? "Ninguna nota coincide" : "Todavía no hay notas de servicio"}
		description={hayFiltros
			? "Prueba con otro estado o quita los filtros."
			: "Se abre una nota cuando recibes una unidad desde su cita en la agenda."}
	>
		{#snippet icon()}<ClipboardList
				size={40}
				aria-hidden="true"
			/>{/snippet}
	</EmptyState>
{:else}
	<DataTable
		columns={["Folio", "Recibida", "Cliente", "Unidad", "Estado", "Km", ""]}
		items={data.notas}
	>
		{#snippet row(nota)}
			<td class="px-4 py-2.5 font-medium text-sand-950">#{nota.folio}</td>
			<td class="px-4 py-2.5">
				<span class="block text-sand-950">{dia(nota.recibidaAt)}</span>
				<span class="block text-xs text-sand-500">{nota.recibidaPorNombre ?? "—"}</span>
			</td>
			<td class="px-4 py-2.5 text-sand-950">{nota.clienteNombre}</td>
			<td class="px-4 py-2.5">
				<span class="block text-sand-950">{nota.unidadEtiqueta}</span>
				{#if nota.unidadNumeroEconomico}
					<span class="block text-xs text-sand-500">Econ. {nota.unidadNumeroEconomico}</span>
				{/if}
			</td>
			<td class="px-4 py-2.5">
				<span class="flex flex-wrap items-center gap-1.5">
					<Badge tone={notaEstadoTone(nota.estado)}>{nota.estadoLabel}</Badge>
					{#if nota.tallerActualNombre}
						<Badge tone="brand"
							><Wrench
								size={11}
								class="inline"
								aria-hidden="true"
							/>
							{nota.tallerActualNombre}</Badge
						>
					{/if}
					{#if !nota.inspeccionada}<Badge tone="warn">Sin inspección</Badge>{/if}
					{#if nota.evidencias > 0}
						<span class="inline-flex items-center gap-0.5 text-xs text-sand-500">
							<Camera
								size={12}
								aria-hidden="true"
							/>{nota.evidencias}
						</span>
					{/if}
				</span>
			</td>
			<td class="px-4 py-2.5 text-sand-600">
				{nota.kilometraje === null ? "—" : nota.kilometraje.toLocaleString("es-MX")}
			</td>
			<td class="px-4 py-2.5 text-right">
				<Button
					href="/panel/notas/{nota.id}"
					variant="ghost"
					size="sm">Ver</Button
				>
			</td>
		{/snippet}
	</DataTable>

	{#if data.totalPages > 1}
		<nav
			class="mt-4 flex items-center justify-between"
			aria-label="Paginación"
		>
			{#if data.page > 1}
				<Button
					href={searchHref(page.url, { page: String(data.page - 1) })}
					variant="ghost"
					size="sm"
				>
					<ChevronLeft
						size={16}
						aria-hidden="true"
					/>
					Anterior
				</Button>
			{:else}<span></span>{/if}
			<span class="text-sm text-sand-600">Página {data.page} de {data.totalPages}</span>
			{#if data.page < data.totalPages}
				<Button
					href={searchHref(page.url, { page: String(data.page + 1) })}
					variant="ghost"
					size="sm"
				>
					Siguiente
					<ChevronRight
						size={16}
						aria-hidden="true"
					/>
				</Button>
			{:else}<span></span>{/if}
		</nav>
	{/if}
{/if}
