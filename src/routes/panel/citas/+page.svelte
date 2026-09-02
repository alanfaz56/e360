<script lang="ts">
	import CalendarDays from "@lucide/svelte/icons/calendar-days";
	import CalendarPlus from "@lucide/svelte/icons/calendar-plus";
	import Search from "@lucide/svelte/icons/search";
	import Truck from "@lucide/svelte/icons/truck";
	import ClipboardList from "@lucide/svelte/icons/clipboard-list";
	import UserCheck from "@lucide/svelte/icons/user-check";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Columns3 from "@lucide/svelte/icons/columns-3";
	import Rows3 from "@lucide/svelte/icons/rows-3";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import ClienteUnidadPicker from "$lib/components/ClienteUnidadPicker.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
	import Drawer from "$lib/components/Drawer.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
	import {
		citaEstadoLabel,
		citaEstadoTone,
		franjaLabel,
		horaSugerida,
		motivoVencidaLabel,
		pasoParaMover,
		puedeMoverCita,
	} from "$lib/citas";
	import { fechaLarga, horaCorta } from "$lib/agenda";
	import { searchHref } from "$lib/url";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";

	let { data, form } = $props();

	type Cita = (typeof data.citas)[number];

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const hayFiltros = $derived(Object.values(data.filtros).some(Boolean) || data.mias || data.vencidas);
	const from = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const to = $derived(Math.min(data.page * data.perPage, data.total));

	// Only the day, without the weekday — the table already has a lot in each row.
	const dia = (fecha: string) => fechaLarga(fecha).replace(/^\w+, /, "");

	// --- Arrastrar una tarjeta -------------------------------------------------------------------
	//
	// Dragging is an ENHANCEMENT: it only ever opens the confirmation drawer, which is a plain URL
	// (`?mover=&a=`) carrying a plain form. With JavaScript off — or with a keyboard, or on a phone,
	// where HTML5 drag and drop does not exist — the card is still a link to the detail screen where
	// every move lives. Nothing is reachable by dragging that is not reachable without it.
	//
	// A column only accepts what the server would accept: `puedeMoverCita` mirrors avanzarCita /
	// confirmarCita / cancelarCita, so a card never drops into a column that then refuses it.

	const permisos = $derived({ ...data.puede, actorId: data.actorId });
	const puedeSoltar = (cita: Cita, destino: string) => puedeMoverCita(cita, destino, permisos);
	const esMovible = (cita: Cita) => data.estados.some((e) => puedeSoltar(cita, e.value));

	let arrastrandoId = $state<string | null>(null);
	let columnaActiva = $state<string | null>(null);
	// `dataTransfer.getData` is unreadable during dragover — the browser hides it until the drop —
	// so which card is in the air has to be held here to decide whether a column may light up.
	const arrastrada = $derived(data.citas.find((c) => c.id === arrastrandoId) ?? null);

	function alArrastrar(evento: DragEvent, cita: Cita) {
		arrastrandoId = cita.id;
		evento.dataTransfer?.setData("text/plain", cita.id);
		if (evento.dataTransfer) evento.dataTransfer.effectAllowed = "move";
	}

	function alSobrevolar(evento: DragEvent, destino: string) {
		// No preventDefault = not a drop target, which is what shows the "no entra" cursor.
		if (!arrastrada || !puedeSoltar(arrastrada, destino)) return;
		evento.preventDefault();
		if (evento.dataTransfer) evento.dataTransfer.dropEffect = "move";
		columnaActiva = destino;
	}

	function alSoltar(evento: DragEvent, destino: string) {
		evento.preventDefault();
		const cita = arrastrada;
		arrastrandoId = null;
		columnaActiva = null;
		if (!cita || !puedeSoltar(cita, destino)) return;
		// The drop opens the confirmation; it never writes. Each move still needs its own hour or
		// its own reason, and a card that changed column on release would have lied about that.
		goto(searchHref(page.url, { mover: cita.id, a: destino }), { noScroll: true, keepFocus: true });
	}

	// --- La confirmación -------------------------------------------------------------------------

	const moverId = $derived(page.url.searchParams.get("mover"));
	const aEstado = $derived(page.url.searchParams.get("a"));
	const enMovimiento = $derived(data.citas.find((c) => c.id === moverId) ?? null);
	const volver = $derived(searchHref(page.url, { mover: null, a: null }));
	const movimientoValido = $derived(enMovimiento !== null && aEstado !== null && puedeSoltar(enMovimiento, aEstado));
	// What the drawer has to ask for before this move can happen. Confirming a request with no
	// cliente or unidad on file asks for those first — vincular is a step OF confirming.
	const paso = $derived(enMovimiento && aEstado && movimientoValido ? pasoParaMover(enMovimiento, aEstado) : null);
	const accion = $derived(
		paso === "motivo"
			? "?/cancelar"
			: paso === "hora"
				? "?/confirmar"
				: paso === "vincular"
					? "?/vincular"
					: "?/avanzar",
	);

	// "recibida" asks first whether the unit showed up before anything else — reset every time a
	// different card (or a different target) is opened, so a leftover "No" from a previous move
	// never carries into the next one.
	let recibioUnidad = $state<"si" | "no" | null>(null);
	$effect(() => {
		moverId;
		aEstado;
		recibioUnidad = null;
	});
</script>

<svelte:head><title>Citas — Estación 360</title></svelte:head>

<PageHeader
	title="Citas"
	description="Todas las citas y solicitudes, con filtros."
>
	{#snippet actions()}
		<!--
		Table or board, keeping every filter: the switch is a change of lens, not of subject.
		The board is the default, so it is the one with no param — `?vista=tabla` opts out.
	-->
		<div class="flex flex-col items-end sm:flex-row sm:items-center sm:justify-between gap-2 w-full mb-4">
			<div class="w-fit">
				<span class="flex rounded-md border border-sand-300 p-0.5">
					<Button
						href={searchHref(page.url, { vista: null, page: null, mover: null, a: null })}
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
						href={searchHref(page.url, { vista: "tabla", page: null, mover: null, a: null })}
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
			</div>

			<div class="flex flex-wrap items-center gap-2 sm:justify-end">
				<Button
					href="/panel/agenda"
					variant="outline"
				>
					<CalendarDays
						size={18}
						aria-hidden="true"
					/>
					Ver calendario
				</Button>

				{#if data.puede.crear}
					<Button href="/panel/agenda?drawer=nueva">
						<CalendarPlus
							size={18}
							aria-hidden="true"
						/>
						Nueva cita
					</Button>
				{/if}
			</div>
		</div>
	{/snippet}
</PageHeader>

<Flash {form} />

<!-- Real GET form: the filters ARE the URL, so any view is shareable and works with JS off. -->
 
{#snippet filters()}
	<Field
		label="Buscar"
		name="q"
		value={data.filtros.q}
		placeholder="Folio, nombre, teléfono, placas…"
	/>

	<Field label="Estado" name="estado">
		{#snippet children(id)}
			<select {id} name="estado" class={INPUT}>
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

	<Field label="Tipo" name="tipo">
		{#snippet children(id)}
			<select {id} name="tipo" class={INPUT}>
				<option value="">Todos</option>
				{#each data.tipos as t (t.value)}
					<option
						value={t.value}
						selected={data.filtros.tipo === t.value}
					>
						{t.label}
					</option>
				{/each}
			</select>
		{/snippet}
	</Field>

	<Field
		label="Desde"
		name="desde"
		type="date"
		value={data.filtros.desde}
	/>

	<Field
		label="Hasta"
		name="hasta"
		type="date"
		value={data.filtros.hasta}
	/>

	{#if data.mias}
		<input type="hidden" name="mias" value="1" />
	{/if}

	{#if data.vencidas}
		<input type="hidden" name="vencidas" value="1" />
	{/if}

	<div class="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
		<Button size="sm">
			<Search size={16} aria-hidden="true" />
			Filtrar
		</Button>

		<Button
			href={searchHref(page.url, {
				vencidas: data.vencidas ? null : "1",
				page: null
			})}
			variant={data.vencidas ? "primary" : "ghost"}
			size="sm"
		>
			<TriangleAlert size={16} aria-hidden="true" />
			Vencidas
		</Button>

		<Button
			href={searchHref(page.url, {
				mias: data.mias ? null : "1",
				page: null
			})}
			variant={data.mias ? "primary" : "ghost"}
			size="sm"
		>
			<UserCheck size={16} aria-hidden="true" />
			Solo las mías
		</Button>

		{#if hayFiltros}
			<Button href="/panel/citas" variant="ghost" size="sm">
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
{/snippet}
<form method="GET" class="mb-4">
	<!-- MOBILE -->
	<details class="group lg:hidden">
		<summary
			class="flex cursor-pointer list-none items-center justify-between rounded-lg border border-sand-200 bg-white p-4"
		>
			<div class="flex items-center gap-2 font-medium">
				<SlidersHorizontal size={18} aria-hidden="true" />
				Filtros
			</div>

			<ChevronDown
				size={18}
				class="transition-transform group-open:rotate-180"
				aria-hidden="true"
			/>
		</summary>

		<div class="mt-2 grid gap-3 rounded-lg border border-sand-200 bg-white p-4">
			{@render filters()}
		</div>
	</details>

	<!-- DESKTOP -->
	<div class="hidden gap-3 rounded-lg border border-sand-200 bg-white p-4 sm:grid-cols-2 lg:grid lg:grid-cols-5">
		{@render filters()}
	</div>
</form>


{#if data.citas.length === 0}
	<EmptyState
		title={hayFiltros ? "Ninguna cita coincide" : "Todavía no hay citas"}
		description={hayFiltros
			? "Prueba con otro rango de fechas o quita los filtros."
			: "Las solicitudes del formulario público y las citas del mostrador aparecen aquí."}
	>
		{#snippet icon()}<CalendarDays
				size={40}
				aria-hidden="true"
			/>{/snippet}
	</EmptyState>
{:else if data.tablero}
	<!--
		The same rows read down instead of across. A board answers "where is everything stuck",
		which a table sorted by date cannot: three requests nobody confirmed are invisible in a
		list and impossible to miss as a column.

		Dragging a card opens the confirmation for that move — it never writes on release. Each move
		still needs what it always needed (an hour to confirm, a reason to cancel), and a column only
		accepts a card the server would accept, so nothing drops into a refusal.

		Columns scroll sideways in their own container; the page never does.
	-->
	<div class="overflow-x-auto pb-2">
		<div class="flex min-w-max gap-3">
			{#each data.estados as col (col.value)}
				{@const enCol = data.citas.filter((c) => c.estado === col.value)}
				{@const admite = arrastrada !== null && puedeSoltar(arrastrada, col.value)}
				<section
					role="group"
					aria-label="Citas {col.label}"
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
						<span class="flex items-center gap-1.5">
							<Badge tone={citaEstadoTone(col.value)}>{col.label}</Badge>
						</span>
						<span class="text-xs text-sand-500">{enCol.length}</span>
					</h2>
					<ul class="max-h-[70svh] space-y-2 overflow-y-auto p-2">
						{#each enCol as cita (cita.id)}
							<li>
								<!--
									The card is a link first: that is what works on a phone, with a keyboard and
									with JavaScript off. `draggable` is switched off when the cita has nowhere
									legal to go, so a card that cannot move never picks up.
								-->
								<a
									href="/panel/citas/{cita.id}"
									draggable={esMovible(cita)}
									ondragstart={(e) => alArrastrar(e, cita)}
									ondragend={() => {
										arrastrandoId = null;
										columnaActiva = null;
									}}
									title={esMovible(cita) ? "Arrástrala a otra columna para moverla" : undefined}
									class="block rounded border border-sand-200 bg-white p-2 text-sm hover:border-brand-600 {esMovible(
										cita,
									)
										? 'cursor-grab active:cursor-grabbing'
										: ''} {arrastrandoId === cita.id ? 'opacity-40' : ''}"
								>
									<span class="flex flex-wrap items-baseline gap-1.5">
										<span class="font-medium text-sand-950">{cita.nombre}</span>
										<span class="text-xs text-sand-500">#{cita.folio}</span>
										{#if cita.tipo === "recoleccion"}
											<Truck
												size={12}
												aria-label="Recolección"
												class="text-sand-500"
											/>
										{/if}
									</span>
									<span class="mt-0.5 block text-xs text-sand-600">
										{dia(cita.fecha)}{cita.inicio
											? ` · ${horaCorta(new Date(cita.inicio))}`
											: cita.franja
												? ` · ${franjaLabel(cita.franja)}`
												: " · sin hora"}
									</span>
									{#if cita.marca || cita.modelo}
										<span class="mt-0.5 block truncate text-xs text-sand-600">
											{[cita.marca, cita.modelo].filter(Boolean).join(" ")}
											{cita.placas ? `· ${cita.placas}` : ""}
										</span>
									{/if}
									<span class="mt-1 block line-clamp-2 text-xs text-sand-500">{cita.motivo}</span>
									<span class="mt-1 flex flex-wrap items-center gap-1.5">
										<!-- The unit arrived and the job is open: that is a different fact from the
										     estado, and it is the one that says the counter is done here. -->
										{#if cita.notaFolio}
											<Badge tone="ok">Nota #{cita.notaFolio}</Badge>
										{/if}
										{#if cita.motivoVencida}
											<Badge tone={cita.motivoVencida === "sin_atender" ? "danger" : "warn"}>
												{motivoVencidaLabel(cita.motivoVencida)}
											</Badge>
										{/if}
									</span>
									{#if cita.asignadoNombre}
										<span class="mt-1 flex items-center gap-1 text-xs text-brand-700">
											<UserCheck
												size={11}
												aria-hidden="true"
											/>
											{cita.asignadoNombre}
										</span>
									{/if}
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
		hasta 200 citas del filtro actual, sin paginar: una columna paginada miente sobre lo que tiene.
	</p>
{:else}
	<DataTable
		columns={["Folio", "Cuándo", "Cliente", "Unidad", "Estado", "Asignada a", ""]}
		items={data.citas}
	>
		{#snippet row(cita)}
			<td class="px-4 py-2.5 font-medium text-sand-950">#{cita.folio}</td>
			<td class="px-4 py-2.5">
				<span class="block text-sand-950">{dia(cita.fecha)}</span>
				<span class="block text-xs text-sand-500">
					{#if cita.inicio}
						{horaCorta(new Date(cita.inicio))}
					{:else}
						Sin hora · pidió {franjaLabel(cita.franja)}
					{/if}
				</span>
			</td>
			<td class="px-4 py-2.5">
				<span class="block text-sand-950">{cita.nombre}</span>
				<span class="block text-xs text-sand-500">{cita.telefono}</span>
			</td>
			<td class="px-4 py-2.5">
				<span class="block text-sand-950">
					{[cita.marca, cita.modelo].filter(Boolean).join(" ") || "—"}
				</span>
				{#if cita.placas}<span class="block text-xs text-sand-500">{cita.placas}</span>{/if}
			</td>
			<td class="px-4 py-2.5">
				<span class="flex flex-wrap items-center gap-1.5">
					<Badge tone={citaEstadoTone(cita.estado)}>{cita.estadoLabel}</Badge>
					{#if cita.tipo === "recoleccion"}
						<Badge tone="brand"
							><Truck
								size={11}
								class="inline"
								aria-hidden="true"
							/> Recolección</Badge
						>
					{/if}
					{#if cita.notaFolio}
						<Badge tone="ok">Nota #{cita.notaFolio}</Badge>
					{/if}
					{#if cita.motivoVencida}
						<Badge tone={cita.motivoVencida === "sin_atender" ? "danger" : "warn"}>
							{motivoVencidaLabel(cita.motivoVencida)}
						</Badge>
					{/if}
				</span>
			</td>
			<td class="px-4 py-2.5 text-sand-600">{cita.asignadoNombre ?? "—"}</td>
			<td class="px-4 py-2.5 text-right">
				<!-- Once the unit arrived, the note is where the work lives — go straight there
				     instead of making the counter open the cita and click again. -->
				{#if cita.notaId}
					<Button
						href="/panel/notas/{cita.notaId}"
						variant="ghost"
						size="sm"
					>
						<ClipboardList
							size={15}
							aria-hidden="true"
						/>
						Nota de servicio
					</Button>
				{:else}
					<Button
						href="/panel/citas/{cita.id}"
						variant="ghost"
						size="sm">Ver</Button
					>
				{/if}
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
	The confirmation for a dropped card. It is URL state like every other drawer, so a refresh keeps
	it, the back button closes it, and the move that follows is a plain <form method="POST"> posting
	to the same server functions the detail screen uses — the board is a shortcut, not a second set
	of rules.

	Dropping a request with no cliente or unidad on Confirmada asks for those FIRST, in this same
	drawer, and comes back here for the hour. `confirmarCita` refuses without them, and sending the
	counter off to another screen to do by hand what this drawer already knows how to do is the
	thing the whole vincular flow exists to avoid.
-->
{#if enMovimiento && aEstado}
	<Drawer
		title={paso === "vincular" ? "Vincular cliente y unidad" : `Mover cita #${enMovimiento.folio}`}
		description={paso === "vincular"
			? `Paso 1 de 2 para confirmar la cita #${enMovimiento.folio}. Los campos vienen llenos con lo que dio el cliente.`
			: `${citaEstadoLabel(enMovimiento.estado)} → ${citaEstadoLabel(aEstado)}`}
		closeHref={volver}
	>
		<div class="mb-4 rounded border border-sand-200 bg-sand-50 p-3 text-sm">
			<span class="block font-medium text-sand-950">{enMovimiento.nombre}</span>
			<span class="block text-xs text-sand-600">
				{dia(enMovimiento.fecha)}{enMovimiento.inicio ? ` · ${horaCorta(new Date(enMovimiento.inicio))}` : ""}
			</span>
			{#if enMovimiento.marca || enMovimiento.modelo}
				<span class="block text-xs text-sand-600">
					{[enMovimiento.marca, enMovimiento.modelo].filter(Boolean).join(" ")}
					{enMovimiento.placas ? `· ${enMovimiento.placas}` : ""}
				</span>
			{/if}
		</div>

		{#if !movimientoValido}
			<!-- Reachable by typing the URL, or by a card somebody else moved first. -->
			<p class="mb-4 text-sm text-sand-700">Ese movimiento no está disponible para esta cita.</p>
			<Button
				href="/panel/citas/{enMovimiento.id}"
				variant="outline"
				full>Abrir la cita</Button
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

				{#if paso === "vincular"}
					<!-- The same component and the same server function the detail screen uses, so the
					     two paths cannot drift on who a vehicle may belong to. -->
					<ClienteUnidadPicker
						clientes={data.vincular?.clientes ?? []}
						unidades={data.vincular?.unidades ?? []}
						sugeridas={data.vincular?.sugeridas ?? []}
						entregadores={data.vincular?.entregadores ?? []}
						clienteId={enMovimiento.clienteId ?? ""}
						clienteNombre={enMovimiento.clienteNombre ?? ""}
						unidadId={enMovimiento.unidadId ?? ""}
						unidadEtiqueta={enMovimiento.unidadEtiqueta ?? ""}
						entregadorId={enMovimiento.entregadorId ?? ""}
						prefill={{
							nombre: enMovimiento.nombre,
							telefono: enMovimiento.telefono,
							email: enMovimiento.email ?? "",
							marca: enMovimiento.marca ?? "",
							modelo: enMovimiento.modelo ?? "",
							anio: enMovimiento.anio,
							placas: enMovimiento.placas ?? "",
						}}
						fichaClienteHref="/panel/clientes"
					/>
				{:else if paso === "motivo"}
					<Field
						label="Motivo"
						name="motivo"
						required
						hint="Queda en el expediente y es lo que se le explica al cliente."
					/>
				{:else if paso === "recibida" && recibioUnidad === null}
					<p class="text-sm text-sand-700">¿La unidad ya está en el taller?</p>
					<div class="flex flex-col gap-2 sm:flex-row">
						<Button
							href="/panel/citas/{enMovimiento.id}?drawer=recibir"
							variant="outline"
							full
						>
							Sí, recibirla
						</Button>
						<Button
							type="button"
							onclick={() => (recibioUnidad = "no")}
							variant="ghost"
							full
						>
							No se recibió
						</Button>
					</div>
				{:else if paso === "recibida" && recibioUnidad === "no"}
					<input
						type="hidden"
						name="estado"
						value={aEstado}
					/>
					<Field
						label="¿Por qué no se recibió la unidad?"
						name="motivo"
						required
						hint="Queda en el expediente de la cita."
					/>
				{:else if paso === "hora"}
					<Field
						label="Inicio"
						name="inicio"
						type="datetime-local"
						required
						value={horaSugerida(enMovimiento)}
						hint="El cliente pidió {franjaLabel(
							enMovimiento.franja,
						).toLowerCase()}. Dura 1 hora por omisión."
					/>
				{:else}
					<input
						type="hidden"
						name="estado"
						value={aEstado}
					/>
					<p class="text-sm text-sand-700">
						¿Mover la cita a <strong>{citaEstadoLabel(aEstado)}</strong>?
					</p>
				{/if}

				{#if !(paso === "recibida" && recibioUnidad === null)}
					<Button full>
						{#if paso === "vincular"}Guardar y seguir{:else if paso === "motivo"}Cancelar la cita{:else if paso === "recibida"}Completar
							sin recibir{:else if paso === "hora"}Confirmar cita{:else}Mover a {citaEstadoLabel(
								aEstado,
							)}{/if}
					</Button>
				{/if}
			</form>
		{/if}
	</Drawer>
{/if}
