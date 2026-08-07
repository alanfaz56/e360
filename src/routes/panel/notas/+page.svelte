<script lang="ts">
	import ClipboardList from "@lucide/svelte/icons/clipboard-list";
	import Search from "@lucide/svelte/icons/search";
	import Wrench from "@lucide/svelte/icons/wrench";
	import Camera from "@lucide/svelte/icons/camera";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Columns3 from "@lucide/svelte/icons/columns-3";
	import Rows3 from "@lucide/svelte/icons/rows-3";
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
		<!--
			Board or table, keeping every filter: the switch is a change of lens, not of subject.
			The board is the default, so it is the one with no param — `?vista=tabla` opts out.
		-->
		<span class="flex rounded-md border border-sand-300 p-0.5">
			<Button
				href={searchHref(page.url, { vista: null, page: null })}
				variant={data.tablero ? "primary" : "ghost"}
				size="sm"
			>
				<Columns3
					size={15}
					aria-hidden="true"
				/>
				Tablero
			</Button>
			<Button
				href={searchHref(page.url, { vista: "tabla", page: null })}
				variant={data.tablero ? "ghost" : "primary"}
				size="sm"
			>
				<Rows3
					size={15}
					aria-hidden="true"
				/>
				Tabla
			</Button>
		</span>
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
{:else if data.tablero}
	<!--
		The same rows read down instead of across. "Where is every vehicle stuck" is the question the
		counter asks all day, and it is the one a list sorted by date cannot answer: three units
		waiting on a partner shop are invisible in a table and impossible to miss as a column.

		No drag and drop here, unlike citas: moving a note is never just a status. `en_taller` needs a
		workshop and a reason, `entregada` records who collected the vehicle, `cancelada` needs a
		motivo — `NOTA_TRANSICIONES` makes all three unreachable through the plain advance on purpose.
		A card that dragged into one of those columns would promise something the drawer behind it
		still has to ask for. The card opens the note, where every move already lives.

		Columns scroll sideways in their own container; the page never does.
	-->
	<div class="overflow-x-auto pb-2">
		<div class="flex min-w-max gap-3">
			{#each data.estados as col (col.value)}
				{@const enCol = data.notas.filter((n) => n.estado === col.value)}
				<section
					class="w-64 shrink-0 rounded-lg border border-sand-200 bg-sand-50"
					aria-label="Notas {col.label}"
				>
					<h2
						class="flex items-center justify-between gap-2 border-b border-sand-200 px-3 py-2 text-sm font-medium text-sand-800"
					>
						<Badge tone={notaEstadoTone(col.value)}>{col.label}</Badge>
						<span class="text-xs text-sand-500">{enCol.length}</span>
					</h2>
					<ul class="max-h-[70svh] space-y-2 overflow-y-auto p-2">
						{#each enCol as nota (nota.id)}
							<li>
								<a
									href="/panel/notas/{nota.id}"
									class="block rounded border border-sand-200 bg-white p-2 text-sm hover:border-brand-600"
								>
									<span class="flex flex-wrap items-baseline gap-1.5">
										<span class="font-medium text-sand-950">{nota.clienteNombre}</span>
										<span class="text-xs text-sand-500">#{nota.folio}</span>
									</span>
									<span class="mt-0.5 block truncate text-xs text-sand-600">
										{nota.unidadEtiqueta}
									</span>
									{#if nota.unidadNumeroEconomico}
										<span class="block text-xs text-sand-500">
											Econ. {nota.unidadNumeroEconomico}
										</span>
									{/if}
									<span class="mt-1 flex flex-wrap items-center gap-1.5">
										<!-- The two things that make a card actionable at a glance: who is holding
										     the vehicle, and whether anybody ever walked around it. -->
										{#if nota.tallerActualNombre}
											<Badge tone="brand">
												<Wrench
													size={11}
													class="inline"
													aria-hidden="true"
												/>
												{nota.tallerActualNombre}
											</Badge>
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
									<span class="mt-1 block text-xs text-sand-400">{dia(nota.recibidaAt)}</span>
								</a>
							</li>
						{:else}
							<li class="px-1 py-3 text-center text-xs text-sand-400">Vacío</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	</div>
	<p class="mt-3 text-xs text-sand-500">
		El tablero muestra hasta 200 notas del filtro actual, sin paginar: una columna paginada miente sobre lo que
		tiene. Abre la nota para moverla — cada paso pide su taller, su motivo o quién recibió la unidad.
	</p>
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
