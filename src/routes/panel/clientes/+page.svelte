<script lang="ts">
	import UserPlus from "@lucide/svelte/icons/user-plus";
	import Search from "@lucide/svelte/icons/search";
	import Contact from "@lucide/svelte/icons/contact";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import SatSelect from "$lib/components/SatSelect.svelte";
	import { REGIMENES_FISCALES, USOS_CFDI } from "$lib/sat-catalogos";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const drawer = $derived(page.url.searchParams.get("drawer"));
	// Which name fields the create form shows. Mirrors the CHECK constraint in the DDL.
	let tipo = $state<"persona" | "organizacion">("persona");

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";
	const hasFilters = $derived(Boolean(data.filtros.q || data.filtros.tipo || data.filtros.archivados));
	const from = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const to = $derived(Math.min(data.page * data.perPage, data.total));
</script>

<svelte:head><title>Clientes — Estación 360</title></svelte:head>

<PageHeader title="Clientes" description="Personas y organizaciones que traen unidades al taller.">
	{#snippet actions()}
		{#if data.puede.crear}
			<Button href={searchHref(page.url, { drawer: "nuevo" })}>
				<UserPlus size={18} aria-hidden="true" />
				Nuevo cliente
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<form method="GET" class="mt-6 rounded-lg border border-sand-200 bg-white p-4">
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
		<Field label="Buscar" name="q">
			{#snippet children(id)}
				<input {id} name="q" value={data.filtros.q} placeholder="Nombre, RFC, teléfono…" class={INPUT} />
			{/snippet}
		</Field>
		<Field label="Tipo" name="tipo">
			{#snippet children(id)}
				<select {id} name="tipo" class={INPUT}>
					<option value="">Todos</option>
					{#each data.tipos as t (t.value)}
						<option value={t.value} selected={t.value === data.filtros.tipo}>{t.label}</option>
					{/each}
				</select>
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
			Incluir archivados
		</label>
	</div>
	<div class="mt-4 flex items-center gap-3">
		<Button size="sm">
			<Search size={16} aria-hidden="true" />
			Filtrar
		</Button>
		{#if hasFilters}
			<a href="/panel/clientes" class="text-sm font-medium text-sand-600 underline hover:text-brand-700">
				Limpiar filtros
			</a>
		{/if}
		<span class="ml-auto text-sm text-sand-600">
			{#if data.total > 0}{from}–{to} de {data.total}{:else}Sin resultados{/if}
		</span>
	</div>
</form>

{#if form?.message}
	<p role="alert" class="mt-4 rounded border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
		{form.message}
	</p>
{/if}

{#if data.clientes.length === 0}
	<div class="mt-6">
		<EmptyState
			title="No hay clientes"
			description={hasFilters
				? "Ningún cliente coincide con esos filtros."
				: "Registra el primer cliente para empezar a recibir unidades."}
		>
			{#snippet icon()}<Contact size={32} aria-hidden="true" />{/snippet}
		</EmptyState>
	</div>
{:else}
	<div class="mt-6">
		<DataTable columns={["Nombre", "Tipo", "Teléfono", "Unidades", "Contactos", ""]} items={data.clientes}>
			{#snippet row(cliente)}
				<td class="px-4 py-2.5 font-medium text-sand-950">
					{cliente.nombreCompleto}
					{#if cliente.archivado}
						<span class="ml-2"><Badge tone="neutral">archivado</Badge></span>
					{/if}
				</td>
				<td class="px-4 py-2.5">
					<Badge tone={cliente.tipo === "organizacion" ? "brand" : "neutral"}>{cliente.tipoLabel}</Badge>
				</td>
				<td class="px-4 py-2.5 text-sand-600">{cliente.telefono ?? "—"}</td>
				<td class="px-4 py-2.5 text-sand-600">{cliente.unidades}</td>
				<td class="px-4 py-2.5 text-sand-600">{cliente.contactos}</td>
				<td class="px-4 py-2.5 text-right">
					<Button href="/panel/clientes/{cliente.id}" variant="ghost" size="sm">Ver</Button>
				</td>
			{/snippet}
		</DataTable>
	</div>

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

{#if drawer === "nuevo" && data.puede.crear}
	<Drawer
		title="Nuevo cliente"
		description="Solo el nombre es obligatorio. Lo demás se completa después."
		closeHref={searchHref(page.url, { drawer: null })}
	>
		<form method="POST" action="?/crear" class="space-y-4">
			<Field label="Tipo" name="tipo">
				{#snippet children(id)}
					<select {id} name="tipo" bind:value={tipo} required class={INPUT}>
						{#each data.tipos as t (t.value)}
							<option value={t.value}>{t.label}</option>
						{/each}
					</select>
				{/snippet}
			</Field>

			{#if tipo === "persona"}
				<Field label="Nombre" name="nombre" required />
				<Field label="Apellidos" name="apellidos" />
			{:else}
				<Field label="Razón social" name="razonSocial" required />
			{/if}

			<Field label="Teléfono" name="telefono" type="tel" />
			<Field label="Correo" name="email" type="email" />
			<Field label="Dirección" name="direccion" />

			<details class="rounded border border-sand-200 px-3 py-2">
				<summary class="cursor-pointer text-sm font-medium text-sand-700">Datos de facturación</summary>
				<div class="mt-3 space-y-3">
					<Field label="RFC" name="rfc" hint="12 o 13 caracteres." />
					<SatSelect label="Régimen fiscal" name="regimenFiscal" catalogo={REGIMENES_FISCALES} {tipo} />
					<Field label="Código postal" name="codigoPostal" hint="5 dígitos." />
					<SatSelect label="Uso CFDI" name="usoCfdi" catalogo={USOS_CFDI} {tipo} />
				</div>
			</details>

			<Button full>Crear cliente</Button>
		</form>
	</Drawer>
{/if}
