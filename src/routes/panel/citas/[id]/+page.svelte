<script lang="ts">
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import Pencil from "@lucide/svelte/icons/pencil";
	import CalendarCheck from "@lucide/svelte/icons/calendar-check";
	import UserCheck from "@lucide/svelte/icons/user-check";
	import Ban from "@lucide/svelte/icons/ban";
	import Truck from "@lucide/svelte/icons/truck";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
	import LinkIcon from "@lucide/svelte/icons/link";
	import ClipboardList from "@lucide/svelte/icons/clipboard-list";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import ClienteUnidadPicker from "$lib/components/ClienteUnidadPicker.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { CITA_TIPOS, CITA_TIPO_KEYS, citaEstadoLabel, citaEstadoTone, franjaLabel, horaSugerida } from "$lib/citas";
	import { fechaLarga, horaCorta, paraDatetimeLocal } from "$lib/agenda";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const c = $derived(data.cita);
	const drawer = $derived(page.url.searchParams.get("drawer"));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null }));

	let tipoElegido = $state<string | null>(null);
	const tipo = $derived(tipoElegido ?? c.tipo);

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const iniciales = (nombre: string) =>
		nombre
			.split(" ")
			.slice(0, 2)
			.map((p) => p[0] ?? "")
			.join("")
			.toUpperCase();

	// Sensible default when confirming: the start of the franja the customer asked for.
	const sugerido = $derived(horaSugerida(c));
</script>

<svelte:head><title>Cita #{c.folio} — Estación 360</title></svelte:head>

<a
	href="/panel/agenda"
	class="mb-4 inline-flex items-center gap-1.5 text-sm text-sand-600 hover:text-brand-700"
>
	<ArrowLeft
		size={16}
		aria-hidden="true"
	/>
	Agenda
</a>

<PageHeader
	title="Cita #{c.folio}"
	description={c.nombre}
>
	{#snippet actions()}
		<!-- Confirming needs a linked cliente and unidad, so route there first rather than
		     offering a button the server would refuse. -->
		{#if c.estado === "solicitada" && data.puede.editar}
			{#if c.vinculada}
				<Button href={searchHref(page.url, { drawer: "confirmar" })}>
					<CalendarCheck
						size={18}
						aria-hidden="true"
					/>
					Confirmar
				</Button>
			{:else}
				<Button href={searchHref(page.url, { drawer: "vincular" })}>
					<LinkIcon
						size={18}
						aria-hidden="true"
					/>
					Vincular para confirmar
				</Button>
			{/if}
		{/if}
		<!-- The vehicle physically arriving is the moment a nota de servicio exists. -->
		{#if data.notaId}
			<Button
				href="/panel/notas/{data.notaId}"
				variant="outline"
			>
				<ClipboardList
					size={18}
					aria-hidden="true"
				/>
				Ver nota de servicio
			</Button>
		{:else if data.puede.recibir && c.vinculada && c.estado !== "cancelada" && c.estado !== "completada"}
			<Button href={searchHref(page.url, { drawer: "recibir" })}>
				<ClipboardList
					size={18}
					aria-hidden="true"
				/>
				Recibir unidad
			</Button>
		{/if}
		{#if data.puede.editar}
			<Button
				href={searchHref(page.url, { drawer: "editar" })}
				variant="outline"
			>
				<Pencil
					size={18}
					aria-hidden="true"
				/>
				Editar
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<Flash {form} />

<div class="mb-5 flex flex-wrap items-center gap-2">
	<Badge tone={citaEstadoTone(c.estado)}>{citaEstadoLabel(c.estado)}</Badge>
	<Badge tone={c.tipo === "recoleccion" ? "brand" : "neutral"}>{c.tipoLabel}</Badge>
	{#if c.origen === "publico"}<Badge tone="warn">Del formulario público</Badge>{/if}
</div>

<!--
	The assignee, given real weight: on a recolección this is the person driving to a customer's
	address, and the counter needs to see at a glance who that is. Links to their profile for
	whoever holds user:stats.
-->
{#if c.asignadoNombre}
	<div class="mb-5 rounded-lg border border-sand-200 bg-white p-4">
		<p class="text-xs uppercase tracking-wide text-sand-500">Responsable</p>
		<div class="mt-2 flex flex-wrap items-center gap-3">
			<span
				class="font-display flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg text-white"
				aria-hidden="true"
			>
				{iniciales(c.asignadoNombre)}
			</span>
			<div class="min-w-0">
				{#if data.puede.verPerfil}
					<a
						href="/panel/usuarios/{c.asignadoId}"
						class="font-display flex items-center gap-1.5 text-2xl text-sand-950 hover:text-brand-700"
					>
						{c.asignadoNombre}
						<ChevronRight
							size={20}
							aria-hidden="true"
						/>
					</a>
					<p class="text-sm text-sand-600">Ver perfil y estadísticas</p>
				{:else}
					<p class="font-display text-2xl text-sand-950">{c.asignadoNombre}</p>
				{/if}
			</div>
			{#if data.puede.asignar}
				<Button
					href={searchHref(page.url, { drawer: "asignar" })}
					variant="ghost"
					size="sm"
					class="ml-auto"
				>
					Reasignar
				</Button>
			{/if}
		</div>
	</div>
{:else if data.puede.asignar}
	<div class="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-sand-300 bg-white p-4">
		<span class="text-sm text-sand-600">Nadie se hace cargo de esta cita todavía.</span>
		<Button
			href={searchHref(page.url, { drawer: "asignar" })}
			size="sm"
			class="sm:ml-auto"
		>
			<UserCheck
				size={16}
				aria-hidden="true"
			/>
			Asignar responsable
		</Button>
	</div>
{/if}

<!--
	The confirm gate. A confirmed appointment is a commitment to work on a specific car for a
	specific person, and the work order that follows hangs off both — so this panel is the first
	thing shown while either is missing.
-->
{#if !c.vinculada && c.estado !== "cancelada"}
	<div class="mb-5 rounded-lg border-2 border-accent-500 bg-accent-500/10 p-4">
		<p class="flex items-center gap-2 font-bold text-sand-900">
			<TriangleAlert
				size={18}
				aria-hidden="true"
			/>
			Falta vincular {!c.clienteId && !c.unidadId
				? "el cliente y la unidad"
				: !c.clienteId
					? "el cliente"
					: "la unidad"}
		</p>
		<p class="mt-1 text-sm text-sand-700">
			No se puede confirmar hasta que la cita apunte a un cliente y a una unidad reales. Puedes crearlos con los
			datos que ya dio el cliente.
		</p>
		{#if data.puede.vincular}
			<Button
				href={searchHref(page.url, { drawer: "vincular" })}
				size="sm"
				class="mt-3"
			>
				<LinkIcon
					size={16}
					aria-hidden="true"
				/>
				Vincular ahora
			</Button>
		{/if}
	</div>
{/if}

{#if c.estado === "cancelada" && c.canceladoMotivo}
	<p class="mb-5 rounded border border-sand-300 bg-sand-100 px-3 py-2 text-sm text-sand-700">
		<strong>Cancelada:</strong>
		{c.canceladoMotivo}
	</p>
{/if}

<div class="grid gap-4 md:grid-cols-2">
	<section class="rounded-lg border border-sand-200 bg-white p-5">
		<h2 class="font-display text-lg text-sand-950">Cuándo</h2>
		<dl class="mt-3 space-y-2 text-sm">
			<div>
				<dt class="text-sand-500">Día</dt>
				<dd class="text-sand-950">{fechaLarga(c.fecha)}</dd>
			</div>
			<div>
				<dt class="text-sand-500">Hora</dt>
				<dd class="text-sand-950">
					{#if c.inicio && c.fin}
						{horaCorta(new Date(c.inicio))} – {horaCorta(new Date(c.fin))}
					{:else}
						Sin hora asignada · pidió {franjaLabel(c.franja)}
					{/if}
				</dd>
			</div>
			{#if c.tipo === "recoleccion"}
				<div>
					<dt class="flex items-center gap-1.5 text-sand-500">
						<Truck
							size={14}
							aria-hidden="true"
						/>
						Recogemos en
					</dt>
					<dd class="text-sand-950">{c.direccionRecoleccion}</dd>
				</div>
			{/if}
		</dl>
	</section>

	<section class="rounded-lg border border-sand-200 bg-white p-5">
		<h2 class="font-display text-lg text-sand-950">Contacto</h2>
		<dl class="mt-3 space-y-2 text-sm">
			<div>
				<dt class="text-sand-500">Nombre</dt>
				<dd class="text-sand-950">{c.nombre}</dd>
			</div>
			<div>
				<dt class="text-sand-500">Teléfono</dt>
				<dd>
					<a
						class="text-brand-700 hover:underline"
						href="tel:{c.telefono}">{c.telefono}</a
					>
				</dd>
			</div>
			{#if c.email}
				<div>
					<dt class="text-sand-500">Correo</dt>
					<dd class="text-sand-950">{c.email}</dd>
				</div>
			{/if}
			{#if c.clienteId}
				<div>
					<dt class="text-sand-500">Cliente registrado</dt>
					<dd>
						<a
							class="text-brand-700 hover:underline"
							href="/panel/clientes/{c.clienteId}"
						>
							{c.clienteNombre}
						</a>
					</dd>
				</div>
			{/if}
		</dl>
	</section>

	<section class="rounded-lg border border-sand-200 bg-white p-5">
		<h2 class="font-display text-lg text-sand-950">Unidad</h2>
		<dl class="mt-3 space-y-2 text-sm">
			<div>
				<dt class="text-sand-500">Vehículo</dt>
				<dd class="text-sand-950">
					{[c.marca, c.modelo, c.anio].filter(Boolean).join(" ") || "Sin datos"}
				</dd>
			</div>
			{#if c.placas}
				<div>
					<dt class="text-sand-500">Placas</dt>
					<dd class="text-sand-950">{c.placas}</dd>
				</div>
			{/if}
			{#if c.unidadId}
				<div>
					<dt class="text-sand-500">Unidad registrada</dt>
					<dd>
						<a
							class="text-brand-700 hover:underline"
							href="/panel/unidades/{c.unidadId}"
						>
							{c.unidadEtiqueta}
						</a>
					</dd>
				</div>
			{/if}
			{#if c.entregadorNombre}
				<div>
					<dt class="text-sand-500">Entrega la unidad</dt>
					<dd class="text-sand-950">
						{c.entregadorNombre}
						{#if c.entregadorTelefono}
							· <a
								class="text-brand-700 hover:underline"
								href="tel:{c.entregadorTelefono}"
							>
								{c.entregadorTelefono}
							</a>
						{/if}
					</dd>
				</div>
			{:else if c.clienteId && c.clienteTipo !== "organizacion"}
				<div>
					<dt class="text-sand-500">Entrega la unidad</dt>
					<dd class="text-sand-600">El cliente mismo</dd>
				</div>
			{/if}
		</dl>
		{#if data.puede.vincular && c.estado !== "cancelada"}
			<Button
				href={searchHref(page.url, { drawer: "vincular" })}
				variant="ghost"
				size="sm"
				class="mt-3"
			>
				<LinkIcon
					size={16}
					aria-hidden="true"
				/>
				{c.vinculada ? "Cambiar vínculos" : "Vincular cliente y unidad"}
			</Button>
		{/if}
	</section>

	<section class="rounded-lg border border-sand-200 bg-white p-5">
		<h2 class="font-display text-lg text-sand-950">Qué necesita</h2>
		<p class="mt-3 whitespace-pre-wrap text-sm text-sand-800">{c.motivo}</p>
		{#if c.notas}
			<h3 class="mt-4 text-sm font-medium text-sand-700">Notas internas</h3>
			<p class="mt-1 whitespace-pre-wrap text-sm text-sand-600">{c.notas}</p>
		{/if}
	</section>
</div>

<!-- Actions -->
<div class="mt-5 flex flex-wrap items-center gap-2">
	{#if data.puede.avanzar}
		{#each data.siguientes as estado (estado)}
			<form
				method="POST"
				action="?/avanzar"
			>
				<input
					type="hidden"
					name="estado"
					value={estado}
				/>
				<Button
					variant="outline"
					size="sm">Marcar {citaEstadoLabel(estado).toLowerCase()}</Button
				>
			</form>
		{/each}
	{/if}
	{#if data.puede.asignar}
		<Button
			href={searchHref(page.url, { drawer: "asignar" })}
			variant="ghost"
			size="sm"
		>
			<UserCheck
				size={16}
				aria-hidden="true"
			/>
			{c.asignadoNombre ? "Reasignar" : "Asignar"}
		</Button>
	{/if}
	{#if data.puede.cancelar && c.estado !== "cancelada" && c.estado !== "completada"}
		<Button
			href={searchHref(page.url, { drawer: "cancelar" })}
			variant="ghost"
			size="sm"
		>
			<Ban
				size={16}
				aria-hidden="true"
			/>
			Cancelar cita
		</Button>
	{/if}
</div>

{#if drawer === "recibir" && data.puede.recibir}
	<Drawer
		title="Recibir unidad"
		description="Abre la nota de servicio. El kilometraje se guarda también en el historial de la unidad."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/recibir"
			class="space-y-4"
		>
			<p class="rounded border border-sand-200 bg-sand-50 p-3 text-sm text-sand-700">
				<strong>{c.clienteNombre}</strong><br />
				{c.unidadEtiqueta}
			</p>

			<!--
				Who physically showed up with the truck. Very often NOT a registered contact — a
				driver, a relative, the neighbour who was free — so the free-text name is a first
				class option, not a fallback. Handing a vehicle over needs no authority: that rule
				belongs at the other end, when somebody takes it away.

				Both halves render: a `<select>` cannot hide anything without JavaScript, and
				nothing here is `required`, so neither branch can trap a no-JS user (Rule 7).
			-->
			<fieldset class="rounded border border-sand-200 p-3">
				<legend class="px-1 text-sm font-medium text-sand-700">¿Quién entrega la unidad?</legend>
				{#if data.contactos.length > 0}
					<label class="block text-xs text-sand-600">
						Contacto registrado
						<select
							name="entregoContactoId"
							class={INPUT}
						>
							<option value="">Otra persona / el cliente mismo</option>
							{#each data.contactos as ct (ct.id)}
								<option value={ct.id}>{ct.nombre} · {ct.rolesLabel}</option>
							{/each}
						</select>
					</label>
				{/if}
				<label class="mt-2 block text-xs text-sand-600">
					Si no está registrada, su nombre
					<input
						type="text"
						name="entregoNombre"
						class={INPUT}
						placeholder="Ej. Juan Pérez (chofer)"
					/>
				</label>
				<label class="mt-2 block text-xs text-sand-600">
					Teléfono
					<input
						type="tel"
						name="entregoTelefono"
						class={INPUT}
					/>
				</label>
				<p class="mt-2 text-xs text-sand-500">
					Opcional, pero es el registro de quién estuvo aquí. Elegir un contacto gana sobre el nombre escrito.
				</p>
			</fieldset>

			<Field
				label="Kilometraje de entrada"
				name="kilometraje"
				type="number"
				min="0"
				value={data.kilometrajeUnidad === null ? "" : String(data.kilometrajeUnidad)}
				hint={data.kilometrajeUnidad === null
					? "Opcional aquí, pero se pide en la inspección."
					: `Último registrado: ${data.kilometrajeUnidad.toLocaleString("es-MX")} km. Corrígelo con el del tablero.`}
			/>
			<label class="flex items-center gap-2 text-sm text-sand-700">
				<input
					type="checkbox"
					name="forzarKilometraje"
					value="1"
					class="size-4 accent-brand-600"
				/>
				Es una corrección (menor al último registrado)
			</label>
			<Field
				label="Observaciones"
				name="observaciones"
			/>
			<Button full>Abrir nota de servicio</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "vincular" && data.puede.vincular}
	<Drawer
		title="Vincular cliente y unidad"
		description="Necesario antes de confirmar. Los campos vienen llenos con lo que dio el cliente."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/vincular"
			class="space-y-5"
		>
			<ClienteUnidadPicker
				clientes={data.clientes}
				unidades={data.unidades}
				sugeridas={data.sugeridas}
				entregadores={data.entregadores}
				clienteId={c.clienteId ?? ""}
				clienteNombre={c.clienteNombre ?? ""}
				unidadId={c.unidadId ?? ""}
				unidadEtiqueta={c.unidadEtiqueta ?? ""}
				entregadorId={c.entregadorId ?? ""}
				prefill={{
					nombre: c.nombre,
					telefono: c.telefono,
					email: c.email ?? "",
					marca: c.marca ?? "",
					modelo: c.modelo ?? "",
					anio: c.anio,
					placas: c.placas ?? "",
				}}
				fichaClienteHref="/panel/clientes"
			/>

			<Button full>Guardar vínculos</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "confirmar" && data.puede.editar}
	<Drawer
		title="Confirmar cita"
		description="Dale la hora exacta. El cliente pidió {franjaLabel(c.franja).toLowerCase()}."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/confirmar"
			class="space-y-4"
		>
			<Field
				label="Inicio"
				name="inicio"
				type="datetime-local"
				required
				value={sugerido}
			/>
			<Field
				label="Fin"
				name="fin"
				type="datetime-local"
				hint="Opcional: 1 hora por omisión."
			/>
			{#if data.puede.asignar}
				<Field
					label="Asignar a"
					name="asignadoId"
				>
					{#snippet children(id)}
						<select
							{id}
							name="asignadoId"
							class={INPUT}
						>
							<option value="">Sin asignar</option>
							{#each data.asignables as u (u.id)}
								<option
									value={u.id}
									selected={c.asignadoId === u.id}>{u.name} · {u.roleLabel}</option
								>
							{/each}
						</select>
					{/snippet}
				</Field>
			{/if}
			<Button full>Confirmar cita</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "editar" && data.puede.editar}
	<Drawer
		title="Editar cita"
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
				required
				value={c.nombre}
			/>
			<Field
				label="Teléfono"
				name="telefono"
				type="tel"
				required
				value={c.telefono}
			/>
			<Field
				label="Correo"
				name="email"
				type="email"
				value={c.email ?? ""}
			/>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<Field
					label="Marca"
					name="marca"
					value={c.marca ?? ""}
				/>
				<Field
					label="Modelo"
					name="modelo"
					value={c.modelo ?? ""}
				/>
				<Field
					label="Placas"
					name="placas"
					value={c.placas ?? ""}
				/>
				<Field
					label="Año"
					name="anio"
					type="number"
					value={c.anio ? String(c.anio) : ""}
				/>
			</div>

			<Field
				label="¿Qué necesita?"
				name="motivo"
			>
				{#snippet children(id)}
					<textarea
						{id}
						name="motivo"
						required
						rows="3"
						class={INPUT}>{c.motivo}</textarea
					>
				{/snippet}
			</Field>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<Field
					label="Inicio"
					name="inicio"
					type="datetime-local"
					value={paraDatetimeLocal(c.inicio)}
				/>
				<Field
					label="Fin"
					name="fin"
					type="datetime-local"
					value={paraDatetimeLocal(c.fin)}
				/>
			</div>

			<Field
				label="Tipo"
				name="tipo"
			>
				{#snippet children(id)}
					<select
						{id}
						name="tipo"
						required
						class={INPUT}
						onchange={(e) => (tipoElegido = e.currentTarget.value)}
					>
						{#each CITA_TIPO_KEYS as t (t)}
							<option
								value={t}
								selected={tipo === t}>{CITA_TIPOS[t].label}</option
							>
						{/each}
					</select>
				{/snippet}
			</Field>

			{#if tipo === "recoleccion"}
				<Field
					label="Dirección de recolección"
					name="direccionRecoleccion"
					required
					value={c.direccionRecoleccion ?? ""}
				/>
			{/if}

			<Field
				label="Notas internas"
				name="notas"
			>
				{#snippet children(id)}
					<textarea
						{id}
						name="notas"
						rows="2"
						class={INPUT}>{c.notas ?? ""}</textarea
					>
				{/snippet}
			</Field>

			<Button full>Guardar</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "asignar" && data.puede.asignar}
	<Drawer
		title="Asignar cita"
		description="Quién se hace cargo. En una recolección, es quien va por la unidad."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/asignar"
			class="space-y-4"
		>
			<Field
				label="Responsable"
				name="asignadoId"
			>
				{#snippet children(id)}
					<select
						{id}
						name="asignadoId"
						class={INPUT}
					>
						<option value="">Sin asignar</option>
						{#each data.asignables as u (u.id)}
							<option
								value={u.id}
								selected={c.asignadoId === u.id}>{u.name} · {u.roleLabel}</option
							>
						{/each}
					</select>
				{/snippet}
			</Field>
			<p class="text-xs text-sand-500">Un Operador solo puede avanzar el estado de las citas asignadas a él.</p>
			<Button full>Guardar</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "cancelar" && data.puede.cancelar}
	<Drawer
		title="Cancelar cita"
		description="El motivo queda en el expediente y es lo que se le explica al cliente."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/cancelar"
			class="space-y-4"
		>
			<Field
				label="Motivo"
				name="motivo"
				required
				hint="Máximo 255 caracteres."
			/>
			<Button full>Cancelar la cita</Button>
		</form>
	</Drawer>
{/if}
