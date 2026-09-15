<script lang="ts">
	import Landmark from "@lucide/svelte/icons/landmark";
	import Plus from "@lucide/svelte/icons/plus";
	import Check from "@lucide/svelte/icons/check";
	import Archive from "@lucide/svelte/icons/archive";
	import Settings from "@lucide/svelte/icons/settings";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	const INPUT = "mt-1 w-full rounded-md border border-sand-300 px-3 py-2 focus:border-brand-600 focus:outline-none";

	let { data, form } = $props();

	const drawer = $derived(page.url.searchParams.get("drawer"));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null }));
</script>

<svelte:head>
	<title>Gastos — Estación 360</title>
</svelte:head>

<PageHeader title="Gastos" description="Electricidad, agua, nómina, renta y demás gastos generales. Se restan de la utilidad neta.">
	{#snippet actions()}
		{#if data.puedeAdministrar}
			<Button href={searchHref(page.url, { drawer: "plantillas" })} variant="ghost">
				<Settings size={18} aria-hidden="true" />
				Plantillas y categorías
			</Button>
		{/if}
		<Button href={searchHref(page.url, { drawer: "nuevo" })}>
			<Plus size={18} aria-hidden="true" />
			Nuevo gasto
		</Button>
	{/snippet}
</PageHeader>

<Flash {form} />

{#if data.gastos.length === 0}
	<div class="mt-6">
		<EmptyState title="Todavía no hay gastos" description="Registra electricidad, agua, nómina u otro gasto general.">
			{#snippet icon()}<Landmark size={40} aria-hidden="true" />{/snippet}
		</EmptyState>
	</div>
{:else}
	<div class="mt-6">
		<DataTable columns={["Fecha", "Descripción", "Categoría", "Monto", "Estado", ""]} items={data.gastos}>
			{#snippet row(g)}
				<td class="px-4 py-2.5 text-sand-700">{g.fecha.toISOString().slice(0, 10)}</td>
				<td class="px-4 py-2.5 font-medium text-sand-950">{g.descripcion}</td>
				<td class="px-4 py-2.5 text-sand-700">{g.categoria.nombre}</td>
				<td class="px-4 py-2.5 font-mono text-sand-900">${g.monto}</td>
				<td class="px-4 py-2.5">
					{#if g.estado === "pendiente"}
						<Badge tone="warn">Pendiente</Badge>
					{:else}
						<Badge tone="ok">Confirmado</Badge>
					{/if}
				</td>
				<td class="px-4 py-2.5 text-right">
					<span class="flex flex-wrap justify-end gap-1">
						{#if g.estado === "pendiente"}
							<form method="POST" action="?/confirmar">
								<input type="hidden" name="id" value={g.id} />
								<input type="hidden" name="monto" value={g.monto} />
								<Button variant="ghost" size="sm">
									<Check size={14} aria-hidden="true" />
									Confirmar
								</Button>
							</form>
						{:else}
							<form method="POST" action="?/archivar">
								<input type="hidden" name="id" value={g.id} />
								<Button variant="ghost" size="sm">
									<Archive size={14} aria-hidden="true" />
									Archivar
								</Button>
							</form>
						{/if}
					</span>
				</td>
			{/snippet}
		</DataTable>
	</div>
{/if}

{#if drawer === "nuevo"}
	<Drawer title="Nuevo gasto" description="Un gasto general no ligado a una nota de servicio." closeHref={closeDrawer}>
		<form method="POST" action="?/crear" class="space-y-4">
			<Field label="Descripción" name="descripcion" value={form?.valores?.descripcion ?? ""} required />
			<Field label="Categoría" name="categoriaId" required>
				{#snippet children(id)}
					<select {id} name="categoriaId" required class={INPUT}>
						<option value="">Selecciona…</option>
						{#each data.categorias as c (c.id)}
							<option value={c.id}>{c.nombre}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			<Field label="Monto" name="monto" value={form?.valores?.monto ?? ""} hint="Usa 1234.50" required />
			<Field label="Fecha" name="fecha" type="date" value={form?.valores?.fecha ?? new Date().toISOString().slice(0, 10)} required />
			<Button full>Registrar gasto</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "plantillas"}
	<Drawer title="Plantillas y categorías" description="Las plantillas generan un borrador cada mes que debes confirmar." closeHref={closeDrawer}>
		<div class="space-y-6">
			<section>
				<h3 class="text-sm font-semibold text-sand-950">Categorías</h3>
				<ul class="mt-2 space-y-1">
					{#each data.categorias as c (c.id)}
						<li class="text-sm text-sand-700">{c.nombre}</li>
					{/each}
				</ul>
				<form method="POST" action="?/crearCategoria" class="mt-3 flex gap-2">
					<input
						name="nombre"
						placeholder="Nueva categoría"
						required
						class="flex-1 rounded-md border border-sand-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
					/>
					<Button size="sm">Agregar</Button>
				</form>
			</section>

			<section>
				<h3 class="text-sm font-semibold text-sand-950">Plantillas recurrentes</h3>
				<ul class="mt-2 space-y-2">
					{#each data.plantillas as p (p.id)}
						<li class="flex items-center justify-between gap-2 text-sm">
							<span class="text-sand-700">{p.descripcion} — {p.categoria.nombre}, día {p.diaMes}</span>
							<form method="POST" action="?/archivarPlantilla">
								<input type="hidden" name="id" value={p.id} />
								<Button variant="ghost" size="sm">
									<Archive size={14} aria-hidden="true" />
								</Button>
							</form>
						</li>
					{/each}
				</ul>
				<form method="POST" action="?/crearPlantilla" class="mt-3 space-y-3">
					<Field label="Descripción" name="descripcion" required />
					<Field label="Categoría" name="categoriaId" required>
						{#snippet children(id)}
							<select {id} name="categoriaId" required class={INPUT}>
								<option value="">Selecciona…</option>
								{#each data.categorias as c (c.id)}
									<option value={c.id}>{c.nombre}</option>
								{/each}
							</select>
						{/snippet}
					</Field>
					<Field label="Monto por default" name="montoDefault" hint="Usa 1234.50" required />
					<Field label="Día del mes" name="diaMes" type="number" value="1" hint="1-28" required />
					<Button full size="sm">Crear plantilla</Button>
				</form>
			</section>
		</div>
	</Drawer>
{/if}
