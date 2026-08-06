<script lang="ts">
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Archive from "@lucide/svelte/icons/archive";
	import ArchiveRestore from "@lucide/svelte/icons/archive-restore";
	import ArrowLeftRight from "@lucide/svelte/icons/arrow-left-right";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { notaEstadoTone, origenKilometrajeLabel } from "$lib/notas";
	import { contactoRoleLabel } from "$lib/contacto-roles";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const drawer = $derived(page.url.searchParams.get("drawer"));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null }));

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";
</script>

<svelte:head><title>{data.unidad.etiqueta} — Estación 360</title></svelte:head>

<a
	href="/panel/unidades"
	class="mb-4 inline-flex items-center gap-1.5 text-sm text-sand-600 hover:text-brand-700"
>
	<ArrowLeft
		size={16}
		aria-hidden="true"
	/>
	Unidades
</a>

<PageHeader
	title="{data.unidad.marca} {data.unidad.modelo}"
	description={data.unidad.placas ?? data.unidad.vin ?? "Sin identificador"}
>
	{#snippet actions()}
		{#if data.puede.editar}
			<Button
				href={searchHref(page.url, { drawer: "editar" })}
				variant="ghost"
				size="sm"
			>
				<Pencil
					size={16}
					aria-hidden="true"
				/>
				Editar
			</Button>
		{/if}
		{#if data.puede.transferir}
			<Button
				href={searchHref(page.url, { drawer: "transferir" })}
				variant="ghost"
				size="sm"
			>
				<ArrowLeftRight
					size={16}
					aria-hidden="true"
				/>
				Transferir
			</Button>
		{/if}
		{#if data.puede.archivar}
			<form
				method="POST"
				action="?/archivar"
			>
				<input
					type="hidden"
					name="archivado"
					value={data.unidad.archivado ? "false" : "true"}
				/>
				<Button
					variant="ghost"
					size="sm"
				>
					{#if data.unidad.archivado}
						<ArchiveRestore
							size={16}
							aria-hidden="true"
						/>
						Restaurar
					{:else}
						<Archive
							size={16}
							aria-hidden="true"
						/>
						Archivar
					{/if}
				</Button>
			</form>
		{/if}
	{/snippet}
</PageHeader>

<Flash {form} />
{#if form?.ok}
	<p
		role="status"
		class="mt-4 rounded border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-sand-800"
	>
		{form.ok}
	</p>
{/if}

<section class="mt-6 rounded-lg border border-sand-200 bg-white p-5">
	<h2 class="font-display text-lg text-sand-950">Datos de la unidad</h2>
	<dl class="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
		<div>
			<dt class="text-sand-500">Cliente actual</dt>
			<dd>
				<a
					class="text-brand-700 hover:underline"
					href="/panel/clientes/{data.unidad.clienteId}">{data.unidad.clienteNombre}</a
				>
			</dd>
		</div>
		<div>
			<dt class="text-sand-500">Año</dt>
			<dd class="text-sand-950">{data.unidad.anio ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Color</dt>
			<dd class="text-sand-950">{data.unidad.color ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Placas</dt>
			<dd class="text-sand-950">{data.unidad.placas ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">VIN / NIV</dt>
			<dd class="font-mono text-xs text-sand-950">{data.unidad.vin ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Número económico</dt>
			<dd class="text-sand-950">{data.unidad.numeroEconomico ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Kilometraje</dt>
			<dd class="text-sand-950">{data.unidad.kilometraje ?? "—"}</dd>
		</div>
		{#if data.unidad.notas}
			<div class="sm:col-span-3">
				<dt class="text-sand-500">Notas</dt>
				<dd class="text-sand-950">{data.unidad.notas}</dd>
			</div>
		{/if}
	</dl>
</section>

<h2 class="font-display mt-10 text-xl text-sand-950">Historial de propietarios</h2>
<p class="mt-1 text-sm text-sand-600">
	El historial de servicio se queda con la unidad; cada trabajo recuerda a quién se le facturó.
</p>
<div class="mt-3">
	<DataTable
		columns={["Cliente", "Desde", "Hasta", "Motivo"]}
		items={data.propietarios}
	>
		{#snippet row(p)}
			<td class="px-4 py-2.5">
				<a
					class="text-brand-700 hover:underline"
					href="/panel/clientes/{p.clienteId}">{p.clienteNombre}</a
				>
				{#if p.actual}
					<span class="ml-2"><Badge tone="ok">actual</Badge></span>
				{/if}
			</td>
			<td class="px-4 py-2.5 text-sand-600">{new Date(p.desde).toLocaleDateString("es-MX")}</td>
			<td class="px-4 py-2.5 text-sand-600">{p.hasta ? new Date(p.hasta).toLocaleDateString("es-MX") : "—"}</td>
			<td class="px-4 py-2.5 text-sand-600">{p.motivo ?? "—"}</td>
		{/snippet}
	</DataTable>
</div>

<!--
	The vehicle's file. Mobile-first: everything stacks in one column on a phone and only splits
	from `lg`, because this is read standing next to the truck as often as at a desk.
-->
<div class="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
	<!-- Kilometraje -->
	<section>
		<h2 class="font-display text-xl text-sand-950">Kilometraje</h2>
		{#if data.kilometraje.lecturas.length === 0}
			<p class="mt-2 text-sm text-sand-500">Sin lecturas registradas.</p>
		{:else}
			<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
				<div class="rounded border border-sand-200 bg-white p-2">
					<p class="text-xs text-sand-500">Actual</p>
					<p class="font-display text-lg text-sand-950">
						{data.kilometraje.resumen.actual?.toLocaleString("es-MX") ?? "—"}
					</p>
				</div>
				<div class="rounded border border-sand-200 bg-white p-2">
					<p class="text-xs text-sand-500">Visitas</p>
					<p class="font-display text-lg text-sand-950">{data.kilometraje.resumen.visitas}</p>
				</div>
				<div class="rounded border border-sand-200 bg-white p-2">
					<p class="text-xs text-sand-500">Recorrido</p>
					<p class="font-display text-lg text-sand-950">
						{data.kilometraje.resumen.totalRecorrido.toLocaleString("es-MX")}
					</p>
				</div>
				<div class="rounded border border-sand-200 bg-white p-2">
					<p class="text-xs text-sand-500">Km/día</p>
					<p class="font-display text-lg text-sand-950">
						{data.kilometraje.resumen.promedioKmPorDia ?? "—"}
					</p>
				</div>
			</div>

			<ul class="mt-3 space-y-1.5 text-sm">
				{#each data.kilometraje.lecturas.slice(0, 12) as l (l.id)}
					<li
						class="flex flex-wrap items-baseline gap-x-2 rounded border border-sand-200 bg-white px-2 py-1.5"
					>
						<span class="font-medium text-sand-950">{l.kilometraje.toLocaleString("es-MX")} km</span>
						<span class="text-xs text-sand-500">{new Date(l.medidoAt).toLocaleDateString("es-MX")}</span>
						{#if l.correccion}<Badge tone="warn">corrección</Badge>{/if}
						{#if l.notaFolio}
							<a
								class="text-xs text-brand-700 hover:underline"
								href="/panel/notas/{l.notaId}"
							>
								Nota #{l.notaFolio}
							</a>
						{:else}
							<span class="text-xs text-sand-500">{origenKilometrajeLabel(l.origen)}</span>
						{/if}
						{#if l.recorrido !== null && l.recorrido > 0}
							<span class="ml-auto text-xs text-sand-600">
								+{l.recorrido.toLocaleString("es-MX")} km
								{#if l.dias}en {l.dias} d{/if}
								{#if l.kmPorDia}· {l.kmPorDia}/día{/if}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Talleres aliados -->
	{#if data.puede.verNotas && data.historial}
		<section>
			<h2 class="font-display text-xl text-sand-950">Talleres que la han atendido</h2>
			{#if data.historial.talleres.length === 0}
				<p class="mt-2 text-sm text-sand-500">Nunca se ha mandado a un taller aliado.</p>
			{:else}
				<p class="mt-1 text-sm text-sand-600">
					{data.historial.resumen.talleresDistintos} taller(es)
					{#if data.historial.resumen.rechazos > 0}
						· <span class="text-danger">{data.historial.resumen.rechazos} rechazo(s) de calidad</span>
					{/if}
				</p>
				<ul class="mt-2 space-y-2 text-sm">
					{#each data.historial.talleres as t (t.id)}
						<li class="rounded border border-sand-200 bg-white p-2">
							<span class="flex flex-wrap items-center gap-2">
								<span class="font-medium text-sand-950">{t.nombre}</span>
								<Badge tone="neutral">{t.visitas} envío(s)</Badge>
								{#if t.rechazos > 0}<Badge tone="danger">{t.rechazos} rechazado(s)</Badge>{/if}
							</span>
							{#if t.especialidades}
								<span class="block text-xs text-sand-500">{t.especialidades}</span>
							{/if}
							<span class="mt-1 block text-xs text-sand-600">{t.motivos.join(" · ")}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<!-- Notas de servicio -->
	{#if data.puede.verNotas && data.historial}
		<section>
			<h2 class="font-display text-xl text-sand-950">Notas de servicio</h2>
			{#if data.historial.notas.length === 0}
				<p class="mt-2 text-sm text-sand-500">Esta unidad nunca ha entrado al taller.</p>
			{:else}
				<p class="mt-1 text-sm text-sand-600">
					{data.historial.resumen.notas} en total · {data.historial.resumen.abiertas} abierta(s)
				</p>
				<ul class="mt-2 space-y-2 text-sm">
					{#each data.historial.notas as n (n.id)}
						<li class="rounded border border-sand-200 bg-white p-2">
							<span class="flex flex-wrap items-center gap-2">
								<a
									class="font-medium text-brand-700 hover:underline"
									href="/panel/notas/{n.id}"
								>
									Nota #{n.folio}
								</a>
								<Badge tone={notaEstadoTone(n.estado)}>{n.estadoLabel}</Badge>
								{#if n.talleres > 0}<Badge tone="neutral">{n.talleres} taller(es)</Badge>{/if}
							</span>
							<span class="block text-xs text-sand-500">
								{new Date(n.recibidaAt).toLocaleDateString("es-MX")}
								{#if n.kilometraje}· {n.kilometraje.toLocaleString("es-MX")} km{/if}
								{#if n.clienteNombre}· {n.clienteNombre}{/if}
							</span>
							<span class="mt-1 block text-sand-700">{n.motivo}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<!-- Personas -->
	<section>
		<h2 class="font-display text-xl text-sand-950">Personas involucradas</h2>

		<h3 class="mt-2 text-xs font-medium uppercase tracking-wide text-sand-500">Del cliente</h3>
		{#if data.contactos.length === 0}
			<p class="mt-1 text-sm text-sand-500">Sin contactos autorizados para esta unidad.</p>
		{:else}
			<ul class="mt-1 space-y-1.5 text-sm">
				{#each data.contactos as c (c.id)}
					<li class="flex flex-wrap items-center gap-2 rounded border border-sand-200 bg-white px-2 py-1.5">
						<span class="font-medium text-sand-950">{c.nombre}</span>
						{#each c.roles as rol (rol)}
							<Badge tone={rol === "entregador" || rol === "autorizador" ? "brand" : "neutral"}>
								{contactoRoleLabel(rol)}
							</Badge>
						{/each}
						{#if c.alcanceUnidades === "especificas"}
							<Badge tone="warn">solo unidades específicas</Badge>
						{/if}
						{#if c.telefono}
							<a
								class="ml-auto text-xs text-brand-700 hover:underline"
								href="tel:{c.telefono}"
							>
								{c.telefono}
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.puede.verNotas && data.historial && data.historial.personas.length > 0}
			<h3 class="mt-4 text-xs font-medium uppercase tracking-wide text-sand-500">Del taller</h3>
			<ul class="mt-1 space-y-1.5 text-sm">
				{#each data.historial.personas as p (p.papel + p.nombre)}
					<li class="flex flex-wrap items-center gap-2 rounded border border-sand-200 bg-white px-2 py-1.5">
						<span class="font-medium text-sand-950">{p.nombre}</span>
						<span class="text-xs text-sand-500">{p.papel}</span>
						<span class="ml-auto text-xs text-sand-600">{p.veces}×</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

{#if drawer === "editar" && data.puede.editar}
	<Drawer
		title="Editar unidad"
		description={data.unidad.etiqueta}
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/editar"
			class="space-y-4"
		>
			<Field
				label="Marca"
				name="marca"
				required
				value={data.unidad.marca}
			/>
			<Field
				label="Modelo"
				name="modelo"
				required
				value={data.unidad.modelo}
			/>
			<Field
				label="Año"
				name="anio"
				type="number"
				value={data.unidad.anio?.toString() ?? ""}
			/>
			<Field
				label="Color"
				name="color"
				value={data.unidad.color ?? ""}
			/>
			<Field
				label="Placas"
				name="placas"
				value={data.unidad.placas ?? ""}
			/>
			<Field
				label="VIN / NIV"
				name="vin"
				value={data.unidad.vin ?? ""}
			/>
			<Field
				label="Número económico"
				name="numeroEconomico"
				value={data.unidad.numeroEconomico ?? ""}
			/>
			<Field
				label="Kilometraje"
				name="kilometraje"
				type="number"
				value={data.unidad.kilometraje?.toString() ?? ""}
			/>
			<Field
				label="Notas"
				name="notas"
				value={data.unidad.notas ?? ""}
			/>
			<p class="text-xs text-sand-500">
				Para cambiar de dueño usa <strong>Transferir</strong>, no este formulario.
			</p>
			<Button full>Guardar</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "transferir" && data.puede.transferir}
	<Drawer
		title="Transferir unidad"
		description="{data.unidad.etiqueta} · dueño actual: {data.unidad.clienteNombre}"
		closeHref={closeDrawer}
	>
		<div class="rounded border border-accent-500/60 bg-accent-500/15 px-3 py-2 text-xs text-sand-800">
			El historial de servicio se queda con la unidad. Se <strong>revocan</strong> las autorizaciones de recolección
			del dueño anterior: el nuevo cliente tendrá que volver a autorizar a su gente.
		</div>

		<form
			method="POST"
			action="?/transferir"
			class="mt-4 space-y-4"
		>
			<Field
				label="Nuevo cliente"
				name="clienteId"
			>
				{#snippet children(id)}
					<select
						{id}
						name="clienteId"
						required
						class={INPUT}
					>
						<option value="">Selecciona…</option>
						{#each data.clientes as cliente (cliente.id)}
							<option value={cliente.id}>{cliente.nombre}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			<Field
				label="Motivo"
				name="motivo"
				required
				hint="Obligatorio. Queda en la auditoría. Ej. «Vendida a…», «Captura errónea»."
			/>
			<Button full>Transferir unidad</Button>
		</form>
	</Drawer>
{/if}
