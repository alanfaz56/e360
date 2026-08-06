<!--
	Audit trail. Filters are a plain GET form, so every filtered view is a shareable URL and
	the whole screen works without JavaScript — including pagination.
-->
<script lang="ts">
	import Search from "@lucide/svelte/icons/search";
	import ScrollText from "@lucide/svelte/icons/scroll-text";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data } = $props();

	const pageHref = (n: number) => searchHref(page.url, { page: String(n) });
	const detail = $derived(data.logs.find((l) => l.id === page.url.searchParams.get("log")));

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const hasFilters = $derived(Object.values(data.filters).some(Boolean));
	const from = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const to = $derived(Math.min(data.page * data.perPage, data.total));
</script>

<svelte:head><title>Auditoría — Estación 360</title></svelte:head>

<PageHeader
	title="Auditoría"
	description="Registro de todo lo que cambia en el sistema. Solo lectura."
/>

<!-- Filters: GET so the URL always describes exactly what you're looking at -->
<form
	method="GET"
	class="mt-6 rounded-lg border border-sand-200 bg-white p-4"
>
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
		<Field
			label="Buscar"
			name="q"
		>
			{#snippet children(id)}
				<input
					{id}
					name="q"
					value={data.filters.q}
					placeholder="Correo, resumen…"
					class={INPUT}
				/>
			{/snippet}
		</Field>

		<Field
			label="Acción"
			name="action"
		>
			{#snippet children(id)}
				<select
					{id}
					name="action"
					class={INPUT}
				>
					<option value="">Todas</option>
					{#each data.actions as action (action.value)}
						<option
							value={action.value}
							selected={action.value === data.filters.action}
						>
							{action.label}
						</option>
					{/each}
				</select>
			{/snippet}
		</Field>

		<Field
			label="Entidad"
			name="entity"
		>
			{#snippet children(id)}
				<select
					{id}
					name="entity"
					class={INPUT}
				>
					<option value="">Todas</option>
					{#each data.entities as entity (entity)}
						<option
							value={entity}
							selected={entity === data.filters.entity}>{entity}</option
						>
					{/each}
				</select>
			{/snippet}
		</Field>

		<Field
			label="Usuario que hizo el cambio"
			name="actor"
		>
			{#snippet children(id)}
				<input
					{id}
					name="actor"
					value={data.filters.actor}
					placeholder="correo@…"
					class={INPUT}
				/>
			{/snippet}
		</Field>

		<Field
			label="Desde"
			name="desde"
		>
			{#snippet children(id)}
				<input
					{id}
					name="desde"
					type="date"
					value={data.filters.desde}
					class={INPUT}
				/>
			{/snippet}
		</Field>

		<Field
			label="Hasta"
			name="hasta"
		>
			{#snippet children(id)}
				<input
					{id}
					name="hasta"
					type="date"
					value={data.filters.hasta}
					class={INPUT}
				/>
			{/snippet}
		</Field>
	</div>

	<div class="mt-4 flex items-center gap-3">
		<Button size="sm">
			<Search
				size={16}
				aria-hidden="true"
			/>
			Filtrar
		</Button>
		{#if hasFilters}
			<a
				href="/panel/auditoria"
				class="text-sm font-medium text-sand-600 underline hover:text-brand-700"
			>
				Limpiar filtros
			</a>
		{/if}
		<span class="ml-auto text-sm text-sand-600">
			{#if data.total > 0}{from}–{to} de {data.total}{:else}Sin resultados{/if}
		</span>
	</div>
</form>

{#if data.logs.length === 0}
	<div class="mt-6">
		<EmptyState
			title="No hay registros"
			description={hasFilters
				? "Ningún movimiento coincide con esos filtros."
				: "Todavía no se ha registrado ningún cambio."}
		>
			{#snippet icon()}
				<ScrollText
					size={32}
					aria-hidden="true"
				/>
			{/snippet}
		</EmptyState>
	</div>
{:else}
	<div class="mt-6">
		<DataTable
			columns={["Fecha", "Acción", "Detalle", "Por", ""]}
			items={data.logs}
		>
			{#snippet row(log)}
				<td class="whitespace-nowrap px-4 py-2.5 text-sand-600">
					{new Date(log.createdAt).toLocaleString("es-MX")}
				</td>
				<td class="px-4 py-2.5"><Badge tone="brand">{log.actionLabel}</Badge></td>
				<td class="px-4 py-2.5 text-sand-950">{log.summary ?? log.entityLabel ?? "—"}</td>
				<td class="px-4 py-2.5 text-sand-600">{log.actorEmail}</td>
				<td class="px-4 py-2.5 text-right">
					{#if log.before || log.after}
						<Button
							href={searchHref(page.url, { log: log.id })}
							variant="ghost"
							size="sm"
						>
							Ver
						</Button>
					{/if}
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
					href={pageHref(data.page - 1)}
					variant="ghost"
					size="sm"
				>
					<ChevronLeft
						size={16}
						aria-hidden="true"
					/>
					Anterior
				</Button>
			{:else}
				<span></span>
			{/if}

			<span class="text-sm text-sand-600">Página {data.page} de {data.totalPages}</span>

			{#if data.page < data.totalPages}
				<Button
					href={pageHref(data.page + 1)}
					variant="ghost"
					size="sm"
				>
					Siguiente
					<ChevronRight
						size={16}
						aria-hidden="true"
					/>
				</Button>
			{:else}
				<span></span>
			{/if}
		</nav>
	{/if}
{/if}

{#if detail}
	<Drawer
		title={detail.actionLabel}
		description={new Date(detail.createdAt).toLocaleString("es-MX")}
		closeHref={searchHref(page.url, { log: null })}
	>
		<dl class="space-y-3 text-sm">
			<div>
				<dt class="font-medium text-sand-700">Resumen</dt>
				<dd class="text-sand-950">{detail.summary ?? "—"}</dd>
			</div>
			<div>
				<dt class="font-medium text-sand-700">Realizado por</dt>
				<dd class="text-sand-950">{detail.actorEmail}</dd>
			</div>
			<div>
				<dt class="font-medium text-sand-700">Registro afectado</dt>
				<dd class="text-sand-950">{detail.entityLabel ?? detail.entityId ?? "—"}</dd>
			</div>
			{#if detail.entityId}
				<div>
					<dt class="font-medium text-sand-700">Historial de este registro</dt>
					<dd>
						<a
							class="text-brand-700 underline"
							href="/panel/auditoria?entityId={encodeURIComponent(detail.entityId)}"
						>
							Ver todo lo que le pasó
						</a>
					</dd>
				</div>
			{/if}
		</dl>

		{#if detail.before || detail.after}
			<div class="mt-5 grid gap-3 border-t border-sand-200 pt-4">
				<div>
					<p class="text-xs font-medium uppercase tracking-wide text-sand-500">Antes</p>
					<pre
						class="mt-1 overflow-x-auto rounded border border-sand-200 bg-sand-50 p-2 text-xs">{JSON.stringify(
							detail.before ?? null,
							null,
							2,
						)}</pre>
				</div>
				<div>
					<p class="text-xs font-medium uppercase tracking-wide text-sand-500">Después</p>
					<pre
						class="mt-1 overflow-x-auto rounded border border-sand-200 bg-sand-50 p-2 text-xs">{JSON.stringify(
							detail.after ?? null,
							null,
							2,
						)}</pre>
				</div>
			</div>
		{/if}
	</Drawer>
{/if}
