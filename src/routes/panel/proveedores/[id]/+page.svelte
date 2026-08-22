<script lang="ts">
	import Truck from "@lucide/svelte/icons/truck";
	import X from "@lucide/svelte/icons/x";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Button from "$lib/components/Button.svelte";
	import Field from "$lib/components/Field.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const drawer = $derived(page.url.searchParams.get("drawer"));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null }));

	const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-MX");
	const yaAsignados = $derived(new Set(data.proveedor.talleres.map((t) => t.tallerId)));
	const disponibles = $derived(data.talleres.filter((t) => !yaAsignados.has(t.id)));
</script>

<svelte:head><title>{data.proveedor.nombre} — Proveedores — Estación 360</title></svelte:head>

<PageHeader
	title={data.proveedor.nombre}
	description="RFC {data.proveedor.rfc}"
/>

<Flash {form} />

<div class="mt-6 grid gap-6 lg:grid-cols-2">
	<div class="rounded-lg border border-sand-200 bg-white p-5">
		<h2 class="font-display text-lg text-sand-950">Talleres asignados</h2>
		<p class="mt-1 text-sm text-sand-500">A cuáles de nuestros talleres surte este proveedor.</p>

		{#if data.proveedor.talleres.length === 0}
			<p class="mt-3 text-sm text-sand-500">Sin asignar todavía.</p>
		{:else}
			<ul class="mt-3 space-y-2">
				{#each data.proveedor.talleres as t (t.tallerId)}
					<li class="flex items-center justify-between rounded border border-sand-200 px-3 py-2 text-sm">
						{t.taller.nombre}
						<form
							method="POST"
							action="?/quitarTaller"
						>
							<input
								type="hidden"
								name="tallerId"
								value={t.tallerId}
							/>
							<button
								type="submit"
								class="text-sand-400 hover:text-red-600"
								aria-label="Quitar {t.taller.nombre}"
							>
								<X
									size={16}
									aria-hidden="true"
								/>
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		{#if disponibles.length > 0}
			<form
				method="POST"
				action="?/asignarTaller"
				class="mt-4 flex items-end gap-2"
			>
				<div class="flex-1">
					<Field
						label="Agregar taller"
						name="tallerId"
					>
						{#snippet children(id)}
							<select
								{id}
								name="tallerId"
								class="mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
							>
								{#each disponibles as t (t.id)}
									<option value={t.id}>{t.nombre}</option>
								{/each}
							</select>
						{/snippet}
					</Field>
				</div>
				<Button
					type="submit"
					size="sm">Asignar</Button
				>
			</form>
		{/if}
	</div>

	<div class="rounded-lg border border-sand-200 bg-white p-5">
		<div class="flex items-center justify-between">
			<h2 class="font-display text-lg text-sand-950">Contacto</h2>
			<Button
				href={searchHref(page.url, { drawer: "editar" })}
				variant="ghost"
				size="sm"
			>
				<Pencil
					size={14}
					aria-hidden="true"
				/>
				Editar
			</Button>
		</div>
		<dl class="mt-3 space-y-1 text-sm">
			<div class="flex justify-between"><dt class="text-sand-500">Contacto</dt><dd>{data.proveedor.contacto ?? "—"}</dd></div>
			<div class="flex justify-between"><dt class="text-sand-500">Teléfono</dt><dd>{data.proveedor.telefono ?? "—"}</dd></div>
			<div class="flex justify-between"><dt class="text-sand-500">Correo</dt><dd>{data.proveedor.email ?? "—"}</dd></div>
		</dl>
	</div>
</div>

{#if drawer === "editar"}
	<Drawer
		title="Editar proveedor"
		description="El RFC no cambia aquí — es el identificador."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/editar"
			class="space-y-4"
		>
			<Field
				label="Nombre"
				name="nombre"
				value={data.proveedor.nombre}
				required
			/>
			<Field
				label="Contacto"
				name="contacto"
				value={data.proveedor.contacto ?? ""}
			/>
			<Field
				label="Teléfono"
				name="telefono"
				value={data.proveedor.telefono ?? ""}
			/>
			<Field
				label="Correo"
				name="email"
				type="email"
				value={data.proveedor.email ?? ""}
			/>
			<Button full>Guardar cambios</Button>
		</form>
	</Drawer>
{/if}

<div class="mt-6">
	<h2 class="font-display text-lg text-sand-950">Historial de compras</h2>
	{#if data.compras.length === 0}
		<EmptyState
			title="Sin compras registradas"
			description="Aparecerán aquí en cuanto se reciba una entrada o se importe un CFDI de este proveedor."
		>
			{#snippet icon()}<Truck
					size={40}
					aria-hidden="true"
				/>{/snippet}
		</EmptyState>
	{:else}
		<div class="mt-3 overflow-x-auto rounded-lg border border-sand-200 bg-white">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-sand-200 text-xs text-sand-500">
					<tr>
						<th class="px-3 py-2 font-medium">Entrada</th>
						<th class="px-3 py-2 font-medium">Fecha CFDI</th>
						<th class="px-3 py-2 font-medium">Total</th>
						<th class="px-3 py-2 font-medium">Notas</th>
					</tr>
				</thead>
				<tbody>
					{#each data.compras as c (c.id)}
						<tr class="border-b border-sand-100 last:border-0">
							<td class="px-3 py-2">#{c.folio}</td>
							<td class="px-3 py-2 text-sand-600">{c.cfdiFecha ? fecha(c.cfdiFecha) : fecha(c.recibidaAt)}</td>
							<td class="px-3 py-2 text-sand-600">{c.cfdiTotal ? `$${Number(c.cfdiTotal).toFixed(2)}` : "—"}</td>
							<td class="px-3 py-2 text-sand-600">{c.notas ?? "—"}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
