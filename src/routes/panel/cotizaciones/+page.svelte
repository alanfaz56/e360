<script lang="ts">
	import ReceiptText from "@lucide/svelte/icons/receipt-text";
	import Search from "@lucide/svelte/icons/search";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import { cotizacionEstadoTone, cotizacionInternoTone, formatoPesos } from "$lib/comercial";
	import { fechaLarga } from "$lib/agenda";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data } = $props();

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const hayFiltros = $derived(Boolean(data.filtros.estado || data.filtros.estadoInterno));
	const from = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const to = $derived(Math.min(data.page * data.perPage, data.total));

	const dia = (iso: string) => fechaLarga(iso.slice(0, 10)).replace(/^\w+, /, "");

	// The shortcut everybody actually wants: authorised work that is still not collected. Two
	// filters at once, which is exactly why it deserves a button instead of an explanation.
	const porCobrarHref = searchHref(page.url, { estado: "autorizada", estadoInterno: "por_cobrar", page: null });
	const enPorCobrar = $derived(data.filtros.estado === "autorizada" && data.filtros.estadoInterno === "por_cobrar");
</script>

<svelte:head><title>Cotizaciones — Estación 360</title></svelte:head>

<PageHeader
	title="Cotizaciones"
	description="Los dos ejes en una sola vista: lo que dijo el cliente y lo que está haciendo el taller."
>
	{#snippet actions()}
		<Button
			href={enPorCobrar ? "/panel/cotizaciones" : porCobrarHref}
			variant={enPorCobrar ? "primary" : "outline"}
		>
			Autorizadas por cobrar
		</Button>
	{/snippet}
</PageHeader>

<!-- Real GET form: the filters ARE the URL, so any view is shareable and works with JS off. -->
<form
	method="GET"
	class="mb-4 grid gap-3 rounded-lg border border-sand-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
>
	<Field
		label="Dijo el cliente"
		name="estado"
	>
		{#snippet children(id)}
			<select
				{id}
				name="estado"
				class={INPUT}
			>
				<option value="">Todas</option>
				{#each data.estados as e (e.value)}
					<option
						value={e.value}
						selected={data.filtros.estado === e.value}>{e.label}</option
					>
				{/each}
			</select>
		{/snippet}
	</Field>
	<Field
		label="Hace el taller"
		name="estadoInterno"
	>
		{#snippet children(id)}
			<select
				{id}
				name="estadoInterno"
				class={INPUT}
			>
				<option value="">Todos</option>
				{#each data.internos as e (e.value)}
					<option
						value={e.value}
						selected={data.filtros.estadoInterno === e.value}>{e.label}</option
					>
				{/each}
			</select>
		{/snippet}
	</Field>

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
				href="/panel/cotizaciones"
				variant="ghost"
				size="sm">Limpiar filtros</Button
			>
		{/if}
		<span class="ml-auto text-sm text-sand-600">
			{#if data.total > 0}{from}–{to} de {data.total}{:else}Sin resultados{/if}
		</span>
	</div>
</form>

{#if data.cotizaciones.length === 0}
	<EmptyState
		title={hayFiltros ? "Ninguna cotización coincide" : "Todavía no hay cotizaciones"}
		description={hayFiltros
			? "Prueba con otro estado o quita los filtros."
			: "Una cotización se arma desde la nota de servicio de la unidad."}
	>
		{#snippet icon()}<ReceiptText
				size={40}
				aria-hidden="true"
			/>{/snippet}
	</EmptyState>
{:else}
	<DataTable
		columns={["Folio", "Fecha", "Cliente", "Nota", "Cliente dijo", "Taller", "Total", ""]}
		items={data.cotizaciones}
	>
		{#snippet row(c)}
			<td class="px-4 py-2.5 font-medium text-sand-950">#{c.folio}</td>
			<td class="px-4 py-2.5 text-sand-600">{dia(c.createdAt)}</td>
			<td class="px-4 py-2.5 text-sand-950">{c.clienteNombre ?? "—"}</td>
			<td class="px-4 py-2.5 text-sand-600">{c.notaFolio === null ? "—" : `#${c.notaFolio}`}</td>
			<td class="px-4 py-2.5">
				<Badge tone={cotizacionEstadoTone(c.estado)}>{c.estadoLabel}</Badge>
				{#if c.autorizadaPorNombre}
					<span class="block text-xs text-sand-500">{c.autorizadaPorNombre}</span>
				{/if}
			</td>
			<td class="px-4 py-2.5">
				<Badge tone={cotizacionInternoTone(c.estadoInterno)}>{c.estadoInternoLabel}</Badge>
			</td>
			<td class="px-4 py-2.5 font-medium text-sand-900">{formatoPesos(Number(c.total))}</td>
			<td class="px-4 py-2.5 text-right">
				<Button
					href="/panel/notas/{c.notaId}"
					variant="ghost"
					size="sm">Ver nota</Button
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
