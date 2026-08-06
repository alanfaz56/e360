<!--
	Global vehicle search. This is the counter's real entry point: a car arrives, you have a
	plate, you need the owner.
-->
<script lang="ts">
	import Search from "@lucide/svelte/icons/search";
	import Car from "@lucide/svelte/icons/car";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data } = $props();

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";
	const hasFilters = $derived(Boolean(data.filtros.q || data.filtros.archivados));
	const from = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const to = $derived(Math.min(data.page * data.perPage, data.total));
</script>

<svelte:head><title>Unidades — Estación 360</title></svelte:head>

<PageHeader
	title="Unidades"
	description="Todos los vehículos registrados en el taller."
/>

<form
	method="GET"
	class="mt-6 rounded-lg border border-sand-200 bg-white p-4"
>
	<div class="grid gap-3 sm:grid-cols-2">
		<Field
			label="Buscar"
			name="q"
		>
			{#snippet children(id)}
				<input
					{id}
					name="q"
					value={data.filtros.q}
					placeholder="Placas, VIN, económico, marca, cliente…"
					class={INPUT}
				/>
			{/snippet}
		</Field>
		<label class="flex items-end gap-2 pb-2 text-sm text-sand-700">
			<input
				type="checkbox"
				name="archivados"
				value="1"
				checked={data.filtros.archivados}
				class="size-4 rounded border-sand-300 accent-brand-600"
			/>
			Incluir archivadas
		</label>
	</div>
	<div class="mt-4 flex items-center gap-3">
		<Button size="sm">
			<Search
				size={16}
				aria-hidden="true"
			/>
			Buscar
		</Button>
		{#if hasFilters}
			<a
				href="/panel/unidades"
				class="text-sm font-medium text-sand-600 underline hover:text-brand-700"
			>
				Limpiar
			</a>
		{/if}
		<span class="ml-auto text-sm text-sand-600">
			{#if data.total > 0}{from}–{to} de {data.total}{:else}Sin resultados{/if}
		</span>
	</div>
</form>

{#if data.unidades.length === 0}
	<div class="mt-6">
		<EmptyState
			title="No hay unidades"
			description={hasFilters
				? "Ninguna unidad coincide con esa búsqueda."
				: "Las unidades se registran desde la ficha de cada cliente."}
		>
			{#snippet icon()}<Car
					size={32}
					aria-hidden="true"
				/>{/snippet}
		</EmptyState>
	</div>
{:else}
	<div class="mt-6">
		<DataTable
			columns={["Unidad", "Placas", "VIN", "Económico", "Cliente", ""]}
			items={data.unidades}
		>
			{#snippet row(unidad)}
				<td class="px-4 py-2.5 font-medium text-sand-950">
					{unidad.marca}
					{unidad.modelo}{unidad.anio ? ` ${unidad.anio}` : ""}
					{#if unidad.archivado}
						<span class="ml-2"><Badge tone="neutral">archivada</Badge></span>
					{/if}
				</td>
				<td class="px-4 py-2.5 text-sand-600">{unidad.placas ?? "—"}</td>
				<td class="px-4 py-2.5 font-mono text-xs text-sand-600">{unidad.vin ?? "—"}</td>
				<td class="px-4 py-2.5 text-sand-600">{unidad.numeroEconomico ?? "—"}</td>
				<td class="px-4 py-2.5">
					<a
						class="text-brand-700 hover:underline"
						href="/panel/clientes/{unidad.clienteId}"
					>
						{unidad.clienteNombre}
					</a>
				</td>
				<td class="px-4 py-2.5 text-right">
					<Button
						href="/panel/unidades/{unidad.id}"
						variant="ghost"
						size="sm">Ver</Button
					>
				</td>
			{/snippet}
		</DataTable>
	</div>

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
