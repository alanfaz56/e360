<script lang="ts">
	import Truck from "@lucide/svelte/icons/truck";
	import Search from "@lucide/svelte/icons/search";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import Button from "$lib/components/Button.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const drawer = $derived(page.url.searchParams.get("drawer"));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null }));
</script>

<svelte:head><title>Proveedores — Estación 360</title></svelte:head>

<PageHeader
	title="Proveedores"
	description="Con quién se compra. RFC como identificador — una factura de un RFC nuevo crea el proveedor solo."
/>

<Flash {form} />

<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
	<form
		method="GET"
		class="flex items-center gap-2"
	>
		<div class="relative">
			<Search
				size={16}
				class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sand-400"
				aria-hidden="true"
			/>
			<input
				type="search"
				name="q"
				value={data.q}
				placeholder="Nombre o RFC…"
				class="w-64 rounded-md border border-sand-300 bg-white py-2 pr-3 pl-9 text-sm focus:border-brand-600 focus:outline-none"
			/>
		</div>
		<Button
			type="submit"
			variant="outline"
			size="sm">Buscar</Button
		>
	</form>
	<Button href={searchHref(page.url, { drawer: "crear" })}>Nuevo proveedor</Button>
</div>

{#if data.proveedores.length === 0}
	<EmptyState
		title="Sin proveedores todavía"
		description="Se crean solos al importar el primer CFDI de compra, o desde aquí."
	>
		{#snippet icon()}<Truck
				size={40}
				aria-hidden="true"
			/>{/snippet}
	</EmptyState>
{:else}
	<div class="mt-4">
		<DataTable
			columns={["Nombre", "RFC", "Contacto", "Teléfono"]}
			items={data.proveedores}
		>
			{#snippet row(p)}
				<td class="px-3 py-2 text-sm">
					<a
						href="/panel/proveedores/{p.id}"
						class="font-medium text-brand-700 hover:underline">{p.nombre}</a
					>
				</td>
				<td class="px-3 py-2 text-sm text-sand-600">{p.rfc}</td>
				<td class="px-3 py-2 text-sm text-sand-600">{p.contacto ?? "—"}</td>
				<td class="px-3 py-2 text-sm text-sand-600">{p.telefono ?? "—"}</td>
			{/snippet}
		</DataTable>
	</div>
{/if}

{#if drawer === "crear"}
	<Drawer
		title="Nuevo proveedor"
		description="El RFC es el identificador — no se puede repetir."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/crear"
			class="space-y-4"
		>
			<Field
				label="RFC"
				name="rfc"
				required
				hint="12 o 13 caracteres."
			/>
			<Field
				label="Nombre"
				name="nombre"
				required
			/>
			<Field
				label="Contacto"
				name="contacto"
			/>
			<Field
				label="Teléfono"
				name="telefono"
			/>
			<Field
				label="Correo"
				name="email"
				type="email"
			/>
			<Button full>Crear proveedor</Button>
		</form>
	</Drawer>
{/if}
