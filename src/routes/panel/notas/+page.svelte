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
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import { notaEstadoLabel, notaEstadoTone, puedeMoverNota, pasoParaMoverNota } from "$lib/notas";
	import { fechaLarga } from "$lib/agenda";
	import { searchHref } from "$lib/url";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";

	let { data, form } = $props();

	type Nota = (typeof data.notas)[number];

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	// "Solo abiertas" is the default now, so it isn't a filter worth a "Limpiar" link — showing
	// everything (abiertas explicitly off) is the deviation.
	const hayFiltros = $derived(Boolean(data.filtros.q || data.filtros.estado || !data.filtros.abiertas));

	// Entregada/cancelada are history, not work in progress — hidden columns while "Solo abiertas"
	// is on instead of rendered empty, same information "abiertas" already filtered out of the rows.
	const columnasTablero = $derived(
		data.filtros.abiertas
			? data.estados.filter((e) => e.value !== "entregada" && e.value !== "cancelada")
			: data.estados,
	);
	const from = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const to = $derived(Math.min(data.page * data.perPage, data.total));

	const dia = (iso: string) => fechaLarga(iso.slice(0, 10)).replace(/^\w+, /, "");

	// --- Arrastrar una tarjeta -------------------------------------------------------------------
	//
	// Same pattern as citas: dragging is an ENHANCEMENT that only ever opens the confirmation drawer
	// (`?mover=&a=`), which is a plain form. Nothing is reachable by dragging that is not reachable
	// without it — the card is always a link to the note.

	const puedeSoltar = (nota: Nota, destino: string) => puedeMoverNota(nota, destino, data.puede);
	const esMovible = (nota: Nota) => columnasTablero.some((e) => puedeSoltar(nota, e.value));

	let arrastrandoId = $state<string | null>(null);
	let columnaActiva = $state<string | null>(null);
	const arrastrada = $derived(data.notas.find((n) => n.id === arrastrandoId) ?? null);

	function alArrastrar(evento: DragEvent, nota: Nota) {
		arrastrandoId = nota.id;
		evento.dataTransfer?.setData("text/plain", nota.id);
		if (evento.dataTransfer) evento.dataTransfer.effectAllowed = "move";
	}

	function alSobrevolar(evento: DragEvent, destino: string) {
		if (!arrastrada || !puedeSoltar(arrastrada, destino)) return;
		evento.preventDefault();
		if (evento.dataTransfer) evento.dataTransfer.dropEffect = "move";
		columnaActiva = destino;
	}

	function alSoltar(evento: DragEvent, destino: string) {
		evento.preventDefault();
		const nota = arrastrada;
		arrastrandoId = null;
		columnaActiva = null;
		if (!nota || !puedeSoltar(nota, destino)) return;
		goto(searchHref(page.url, { mover: nota.id, a: destino }), { noScroll: true, keepFocus: true });
	}

	// --- La confirmación -------------------------------------------------------------------------

	const moverId = $derived(page.url.searchParams.get("mover"));
	const aEstado = $derived(page.url.searchParams.get("a"));
	const enMovimiento = $derived(data.notas.find((n) => n.id === moverId) ?? null);
	const volver = $derived(searchHref(page.url, { mover: null, a: null }));
	const movimientoValido = $derived(enMovimiento !== null && aEstado !== null && puedeSoltar(enMovimiento, aEstado));
	const paso = $derived(enMovimiento && aEstado && movimientoValido ? pasoParaMoverNota(aEstado) : null);
	const accion = $derived(
		paso === "cancelar"
			? "?/cancelar"
			: paso === "entregar"
				? "?/entregar"
				: paso === "transferir"
					? "?/transferir"
					: "?/avanzar",
	);
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
			href={searchHref(page.url, { abiertas: data.filtros.abiertas ? "0" : null, page: null })}
			variant={data.filtros.abiertas ? "primary" : "outline"}
		>
			Solo abiertas
		</Button>
	{/snippet}
</PageHeader>

<Flash {form} />

<!-- Real GET form: the filters ARE the URL, so any view is shareable and works with JS off. -->
<form
	method="GET"
	class="mb-4"
>
	<!-- Mobile -->
	<details class="group lg:hidden">
		<summary
			class="flex cursor-pointer list-none items-center justify-between rounded-lg border border-sand-200 bg-white p-4"
		>
			<div class="flex items-center gap-2 font-medium">
				<SlidersHorizontal
					size={18}
					aria-hidden="true"
				/>
				Filtros
			</div>

			<ChevronDown
				size={18}
				class="transition-transform group-open:rotate-180"
				aria-hidden="true"
			/>
		</summary>

		<div class="mt-2 grid gap-3 rounded-lg border border-sand-200 bg-white p-4">
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
								selected={data.filtros.estado === e.value}
							>
								{e.label}
							</option>
						{/each}
					</select>
				{/snippet}
			</Field>

			{#if !data.filtros.abiertas}
				<input
					type="hidden"
					name="abiertas"
					value="0"
				/>
			{/if}

			<div class="flex flex-wrap items-end gap-2">
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
						size="sm"
					>
						Limpiar filtros
					</Button>
				{/if}

				<span class="ml-auto text-sm text-sand-600">
					{#if data.total > 0}
						{from}–{to} de {data.total}
					{:else}
						Sin resultados
					{/if}
				</span>
			</div>
		</div>
	</details>

	<!-- Desktop -->
	<div class="hidden gap-3 rounded-lg border border-sand-200 bg-white p-4 sm:grid-cols-2 lg:grid lg:grid-cols-4">
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
							selected={data.filtros.estado === e.value}
						>
							{e.label}
						</option>
					{/each}
				</select>
			{/snippet}
		</Field>

		{#if !data.filtros.abiertas}
			<input
				type="hidden"
				name="abiertas"
				value="0"
			/>
		{/if}

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
					size="sm"
				>
					Limpiar filtros
				</Button>
			{/if}

			<span class="ml-auto text-sm text-sand-600">
				{#if data.total > 0}
					{from}–{to} de {data.total}
				{:else}
					Sin resultados
				{/if}
			</span>
		</div>
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

		Dragging a card opens the confirmation for that move — it never writes on release. Each move
		still needs what it always needed (a taller and a reason, who received the unit, a motivo to
		cancel), and a column only accepts a card the server would accept, so nothing drops into a
		refusal. `en_taller` cards cannot be picked up at all: leaving a partner shop is a QA verdict,
		not a column a card lands in.

		Columns scroll sideways in their own container; the page never does.
	-->
	<div class="overflow-x-auto pb-2">
		<div class="flex min-w-max gap-3">
			{#each columnasTablero as col (col.value)}
				{@const enCol = data.notas.filter((n) => n.estado === col.value)}
				{@const admite = arrastrada !== null && puedeSoltar(arrastrada, col.value)}
				<section
					role="group"
					aria-label="Notas {col.label}"
					ondragover={(e) => alSobrevolar(e, col.value)}
					ondragleave={() => (columnaActiva = null)}
					ondrop={(e) => alSoltar(e, col.value)}
					class="w-64 shrink-0 rounded-lg border bg-sand-50 transition-colors {columnaActiva === col.value &&
					admite
						? 'border-brand-600 bg-brand-50'
						: admite
							? 'border-dashed border-brand-400'
							: arrastrada
								? 'border-sand-200 opacity-50'
								: 'border-sand-200'}"
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
									draggable={esMovible(nota)}
									ondragstart={(e) => alArrastrar(e, nota)}
									ondragend={() => {
										arrastrandoId = null;
										columnaActiva = null;
									}}
									title={esMovible(nota) ? "Arrástrala a otra columna para moverla" : undefined}
									class="block rounded border border-sand-200 bg-white p-2 text-sm hover:border-brand-600 {esMovible(
										nota,
									)
										? 'cursor-grab active:cursor-grabbing'
										: ''} {arrastrandoId === nota.id ? 'opacity-40' : ''}"
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
		Arrastra una tarjeta a otra columna para moverla; te pedimos confirmar antes de guardar. El tablero muestra
		hasta 200 notas del filtro actual, sin paginar: una columna paginada miente sobre lo que tiene.
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

<!--
	The confirmation for a dropped card. URL state like every other drawer, so a refresh keeps it and
	the back button closes it. The form posts to the same server functions the detail screen uses —
	the board is a shortcut, never a second set of rules.
-->
{#if enMovimiento && aEstado}
	<Drawer
		title={paso === "cancelar"
			? "Cancelar nota"
			: paso === "entregar"
				? "Entregar unidad"
				: paso === "transferir"
					? "Mandar a un taller aliado"
					: `Mover nota #${enMovimiento.folio}`}
		description={paso === "avanzar"
			? `${notaEstadoLabel(enMovimiento.estado)} → ${notaEstadoLabel(aEstado)}`
			: `Nota #${enMovimiento.folio} · ${enMovimiento.clienteNombre}`}
		closeHref={volver}
	>
		<div class="mb-4 rounded border border-sand-200 bg-sand-50 p-3 text-sm">
			<span class="block font-medium text-sand-950">{enMovimiento.clienteNombre}</span>
			<span class="block text-xs text-sand-600">{enMovimiento.unidadEtiqueta}</span>
		</div>

		{#if !movimientoValido}
			<!-- Reachable by typing the URL, or by a card somebody else moved first. -->
			<p class="mb-4 text-sm text-sand-700">Ese movimiento no está disponible para esta nota.</p>
			<Button
				href="/panel/notas/{enMovimiento.id}"
				variant="outline"
				full>Abrir la nota</Button
			>
		{:else if aEstado === "lista" && !enMovimiento.unidadLiberada}
			<!-- "Liberación 360": el servidor rechaza este movimiento sin el checklist en "sí", así que
			     el drop manda directo al checklist en vez de a una confirmación que de todos modos
			     va a fallar. -->
			<p class="mb-4 text-sm text-sand-700">
				Falta el checklist de liberación — no se puede marcar lista para entrega sin él.
			</p>
			<Button
				href="/panel/notas/{enMovimiento.id}?drawer=liberacion"
				full>Llenar el checklist</Button
			>
		{:else}
			<form
				method="POST"
				action={accion}
				class="space-y-4"
			>
				<input
					type="hidden"
					name="id"
					value={enMovimiento.id}
				/>
				<!-- The board carries its filters in the URL; without this every move would drop the
				     operator back onto an unfiltered board. -->
				<input
					type="hidden"
					name="volver"
					value={volver}
				/>

				{#if paso === "cancelar"}
					<Field
						label="Motivo"
						name="motivo"
						required
						hint="Queda en el expediente."
					/>
				{:else if paso === "entregar"}
					<Field
						label="¿Quién recibe?"
						name="contactoId"
						hint="Solo contactos con rol de Entregador."
					>
						{#snippet children(id)}
							<select
								{id}
								name="contactoId"
								class={INPUT}
							>
								<option value="">El cliente mismo</option>
								{#each data.entregadores as e (e.id)}
									<option value={e.id}>{e.nombre}{e.telefono ? ` · ${e.telefono}` : ""}</option>
								{/each}
							</select>
						{/snippet}
					</Field>
					{#if data.entregadores.length === 0}
						<p class="text-xs text-sand-500">
							Este cliente no tiene entregadores registrados.
							<a
								class="underline"
								href="/panel/clientes/{enMovimiento.clienteId}">Agrégalos en su ficha</a
							>.
						</p>
					{/if}
					<Field
						label="Observaciones de entrega"
						name="observaciones"
					/>
				{:else if paso === "transferir"}
					<Field
						label="Taller"
						name="tallerId"
					>
						{#snippet children(id)}
							<select
								{id}
								name="tallerId"
								required
								class={INPUT}
							>
								<option value="">Elige…</option>
								{#each data.talleres as t (t.id)}
									<option value={t.id}
										>{t.nombre}{t.especialidades ? ` · ${t.especialidades}` : ""}</option
									>
								{/each}
							</select>
						{/snippet}
					</Field>
					{#if data.talleres.length === 0}
						<p class="text-xs text-sand-500">
							No hay talleres dados de alta. <a
								class="underline"
								href="/panel/talleres">Agrégalos aquí</a
							>.
						</p>
					{/if}
					<Field
						label="¿Para qué?"
						name="motivo"
						required
					/>
				{:else}
					<input
						type="hidden"
						name="estado"
						value={aEstado}
					/>
					<p class="text-sm text-sand-700">
						¿Mover la nota a <strong>{notaEstadoLabel(aEstado)}</strong>?
					</p>
				{/if}

				<Button full>
					{#if paso === "cancelar"}Cancelar la nota{:else if paso === "entregar"}Marcar entregada{:else if paso === "transferir"}Enviar
						al taller{:else}Mover a {notaEstadoLabel(aEstado)}{/if}
				</Button>
			</form>
		{/if}
	</Drawer>
{/if}
