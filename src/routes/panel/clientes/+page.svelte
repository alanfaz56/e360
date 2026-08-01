<script lang="ts">
	import Contact from "@lucide/svelte/icons/contact";
	import UserPlus from "@lucide/svelte/icons/user-plus";
	import Button from "$lib/components/Button.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data } = $props();

	const drawer = $derived(page.url.searchParams.get("drawer"));
</script>

<svelte:head><title>Clientes — Estación 360</title></svelte:head>

<PageHeader title="Clientes" description="Registro de clientes y sus vehículos.">
	{#snippet actions()}
		{#if data.canCreate}
			<Button href={searchHref(page.url, { drawer: "nuevo" })}>
				<UserPlus size={18} aria-hidden="true" />
				Nuevo cliente
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<div class="mt-6">
	<EmptyState
		title="Todavía no hay clientes"
		description="Esta sección aún no está conectada a la base de datos. El siguiente paso es el modelo de cliente y vehículo."
	>
		{#snippet icon()}
			<Contact size={32} aria-hidden="true" />
		{/snippet}
	</EmptyState>
</div>

{#if drawer === "nuevo" && data.canCreate}
	<Drawer
		title="Nuevo cliente"
		description="Pendiente: falta el modelo de datos."
		closeHref={searchHref(page.url, { drawer: null })}
	>
		<p class="text-sm text-sand-600">
			El formulario se construye cuando definamos los campos del cliente (nombre, teléfono, RFC,
			vehículos). El cajón ya funciona y respeta permisos.
		</p>
	</Drawer>
{/if}
