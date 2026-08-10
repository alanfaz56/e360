<script lang="ts">
	import Bell from "@lucide/svelte/icons/bell";
	import Plus from "@lucide/svelte/icons/plus";
	import Check from "@lucide/svelte/icons/check";
	import Undo2 from "@lucide/svelte/icons/undo-2";
	import CalendarPlus from "@lucide/svelte/icons/calendar-plus";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import EntitySearch, { type Opcion } from "$lib/components/EntitySearch.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import { fechaLarga } from "$lib/agenda";
	import { RECORDATORIO_TIPOS, RECORDATORIO_TIPO_KEYS } from "$lib/recordatorios";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	let { data, form } = $props();

	const drawer = $derived(page.url.searchParams.get("drawer"));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null }));
	const dia = (iso: string) => fechaLarga(iso).replace(/^\w+, /, "");

	const buscarUnidades = async (q: string, signal: AbortSignal): Promise<Opcion[]> => {
		const res = await fetch(`/api/unidades?q=${encodeURIComponent(q)}&perPage=8`, { signal });
		if (!res.ok) throw new Error("No pudimos buscar unidades.");
		const body = await res.json();
		return (body.unidades ?? []).map(
			(u: {
				id: string;
				marca: string;
				modelo: string;
				anio: number | null;
				clienteNombre: string | null;
				placas: string | null;
				vin: string | null;
				numeroEconomico: string | null;
			}) => ({
				id: u.id,
				label: `${u.marca} ${u.modelo}${u.anio ? ` ${u.anio}` : ""}`,
				hint: u.clienteNombre,
				detalles: [u.numeroEconomico ? `Econ. ${u.numeroEconomico}` : null, u.placas, u.vin ? `VIN ${u.vin}` : null],
			}),
		);
	};
</script>

<svelte:head><title>Recordatorios — Estación 360</title></svelte:head>

<PageHeader
	title="Recordatorios"
	description="Seguimiento manual: a quién llamar y cuándo."
>
	{#snippet actions()}
		<Button href={searchHref(page.url, { drawer: "nuevo" })}>
			<Plus
				size={18}
				aria-hidden="true"
			/>
			Nuevo recordatorio
		</Button>
	{/snippet}
</PageHeader>

<Flash {form} />

<form
	method="GET"
	class="mb-4 flex flex-wrap items-center gap-2"
>
	<Button
		href={searchHref(page.url, { vencidos: data.filtros.vencidos ? null : "1", hecho: null, page: null })}
		variant={data.filtros.vencidos ? "primary" : "outline"}
		size="sm"
	>
		Vencidos
	</Button>
	<Button
		href={searchHref(page.url, { hecho: data.filtros.hecho ? null : "1", vencidos: null, page: null })}
		variant={data.filtros.hecho ? "primary" : "outline"}
		size="sm"
	>
		Hechos
	</Button>
</form>

{#if data.recordatorios.length === 0}
	<EmptyState
		title="Sin recordatorios"
		description="Agrega uno desde aquí o desde la ficha de una unidad."
	>
		{#snippet icon()}<Bell
				size={40}
				aria-hidden="true"
			/>{/snippet}
	</EmptyState>
{:else}
	<DataTable
		columns={["Fecha", "Unidad", "Cliente", "Tipo", "Motivo", "Creado por", ""]}
		items={data.recordatorios}
	>
		{#snippet row(r)}
			<td class="px-4 py-2.5">
				<span class="block text-sand-950">{dia(r.fecha)}</span>
				{#if r.vencido}<Badge tone="danger">Vencido</Badge>{/if}
			</td>
			<td class="px-4 py-2.5">
				<a
					href="/panel/unidades/{r.unidadId}"
					class="text-sand-950 hover:text-brand-700">{r.unidadEtiqueta}</a
				>
			</td>
			<td class="px-4 py-2.5 text-sand-600">{r.clienteNombre}</td>
			<td class="px-4 py-2.5"><Badge tone="neutral">{r.tipoLabel}</Badge></td>
			<td class="px-4 py-2.5 text-sand-600">{r.motivo}</td>
			<td class="px-4 py-2.5 text-sand-600">{r.creadoPorNombre ?? "—"}</td>
			<td class="px-4 py-2.5 text-right">
				<div class="flex justify-end gap-1">
					{#if !r.hecho}
						<Button
							href="/panel/agenda?vista=dia&fecha={r.fecha}&drawer=nueva&unidadId={r.unidadId}&motivo={encodeURIComponent(
								r.motivo,
							)}&recordatorioId={r.id}"
							variant="ghost"
							size="sm"
						>
							<CalendarPlus
								size={14}
								aria-hidden="true"
							/>
							Convertir en cita
						</Button>
					{/if}
					<form
						method="POST"
						action="?/marcar"
					>
						<input
							type="hidden"
							name="id"
							value={r.id}
						/>
						<input
							type="hidden"
							name="hecho"
							value={r.hecho ? "0" : "1"}
						/>
						<Button
							variant="ghost"
							size="sm"
						>
							{#if r.hecho}
								<Undo2
									size={14}
									aria-hidden="true"
								/>
								Reabrir
							{:else}
								<Check
									size={14}
									aria-hidden="true"
								/>
								Marcar hecho
							{/if}
						</Button>
					</form>
				</div>
			</td>
		{/snippet}
	</DataTable>
{/if}

{#if drawer === "nuevo"}
	<Drawer
		title="Nuevo recordatorio"
		description="Motivo y fecha para dar seguimiento."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/crear"
			class="space-y-4"
		>
			<EntitySearch
				label="Unidad"
				name="unidadId"
				buscar={buscarUnidades}
				required
			/>
			<Field
				label="Motivo"
				name="motivo"
				required
				hint="Ej. «Recordar próximo cambio de aceite»."
			/>
			<Field
				label="Fecha"
				name="fecha"
				type="date"
				required
			/>
			<Field
				label="Tipo"
				name="tipo"
			>
				{#snippet children(id)}
					<select
						{id}
						name="tipo"
						class={INPUT}
					>
						{#each RECORDATORIO_TIPO_KEYS as t (t)}
							<option value={t}>{RECORDATORIO_TIPOS[t].label}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			<Button full>Agregar</Button>
		</form>
	</Drawer>
{/if}
