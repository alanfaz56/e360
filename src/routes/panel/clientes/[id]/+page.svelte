<script lang="ts">
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import Pencil from "@lucide/svelte/icons/pencil";
	import UserPlus from "@lucide/svelte/icons/user-plus";
	import CarFront from "@lucide/svelte/icons/car-front";
	import Archive from "@lucide/svelte/icons/archive";
	import ArchiveRestore from "@lucide/svelte/icons/archive-restore";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import ShieldCheck from "@lucide/svelte/icons/shield-check";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import SatSelect from "$lib/components/SatSelect.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { REGIMENES_FISCALES, USOS_CFDI, satLabel } from "$lib/sat-catalogos";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const drawer = $derived(page.url.searchParams.get("drawer"));
	const editando = $derived(data.contactos.find((c) => c.id === page.url.searchParams.get("contacto")));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null, contacto: null }));

	// Two selects drive which fields render. Each is "whatever the user picked, else what the
	// record says" — derived rather than copied into state, so the server-rendered HTML is
	// already correct (no flash of the wrong fields) and a reload after saving is picked up.
	let tipoElegido = $state<"persona" | "organizacion" | null>(null);
	const tipo = $derived(tipoElegido ?? (data.cliente.tipo as "persona" | "organizacion"));

	// Scope selector inside the contact drawer: only show the unit picker when it applies.
	let alcanceElegido = $state<"todas" | "especificas" | null>(null);
	const alcance = $derived(alcanceElegido ?? (editando?.alcanceUnidades as "todas" | "especificas") ?? "todas");

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const activas = $derived(data.unidades.filter((u) => !u.archivado));
</script>

<svelte:head><title>{data.cliente.nombreCompleto} — Estación 360</title></svelte:head>

<a
	href="/panel/clientes"
	class="mb-4 inline-flex items-center gap-1.5 text-sm text-sand-600 hover:text-brand-700"
>
	<ArrowLeft
		size={16}
		aria-hidden="true"
	/>
	Clientes
</a>

<PageHeader
	title={data.cliente.nombreCompleto}
	description={data.cliente.tipoLabel}
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
		{#if data.puede.archivar}
			<form
				method="POST"
				action="?/archivar"
			>
				<input
					type="hidden"
					name="archivado"
					value={data.cliente.archivado ? "false" : "true"}
				/>
				<Button
					variant="ghost"
					size="sm"
				>
					{#if data.cliente.archivado}
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

{#if data.cliente.archivado}
	<p class="mt-4 rounded border border-sand-300 bg-sand-100 px-3 py-2 text-sm text-sand-700">
		Este cliente está archivado. No se le pueden agregar unidades hasta restaurarlo.
	</p>
{/if}
<Flash {form} />
{#if form?.ok}
	<p
		role="status"
		class="mt-4 rounded border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-sand-800"
	>
		{form.ok}
	</p>
{/if}

<!-- Datos -->
<section class="mt-6 rounded-lg border border-sand-200 bg-white p-5">
	<h2 class="font-display text-lg text-sand-950">Datos</h2>
	<dl class="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
		<div>
			<dt class="text-sand-500">Teléfono</dt>
			<dd class="text-sand-950">{data.cliente.telefono ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Correo</dt>
			<dd class="text-sand-950">{data.cliente.email ?? "—"}</dd>
		</div>
		<div class="sm:col-span-2">
			<dt class="text-sand-500">Dirección</dt>
			<dd class="text-sand-950">{data.cliente.direccion ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">RFC</dt>
			<dd class="text-sand-950">{data.cliente.rfc ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Régimen fiscal</dt>
			<dd class="text-sand-950">{satLabel(REGIMENES_FISCALES, data.cliente.regimenFiscal) ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Código postal</dt>
			<dd class="text-sand-950">{data.cliente.codigoPostal ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Uso CFDI</dt>
			<dd class="text-sand-950">{satLabel(USOS_CFDI, data.cliente.usoCfdi) ?? "—"}</dd>
		</div>
		{#if data.cliente.notas}
			<div class="sm:col-span-2">
				<dt class="text-sand-500">Notas</dt>
				<dd class="text-sand-950">{data.cliente.notas}</dd>
			</div>
		{/if}
	</dl>
</section>

<!-- Contactos -->
<div class="mt-10 flex flex-wrap items-center gap-3">
	<h2 class="font-display text-xl text-sand-950">Personas relacionadas</h2>
	{#if data.puede.contactos}
		<Button
			href={searchHref(page.url, { drawer: "contacto" })}
			size="sm"
			class="ml-auto"
		>
			<UserPlus
				size={16}
				aria-hidden="true"
			/>
			Agregar persona
		</Button>
	{/if}
</div>

{#if data.cliente.tipo === "persona"}
	<p class="mt-1 text-sm text-sand-600">
		{data.cliente.nombreCompleto} puede recoger sus propias unidades sin estar en esta lista. Agrega aquí a quien más
		pueda hacerlo.
	</p>
{:else}
	<p class="mt-1 text-sm text-sand-600">
		Una organización no puede firmar por sí misma: registra a las personas autorizadas.
	</p>
{/if}

{#if data.contactos.length === 0}
	<p
		class="mt-3 rounded-lg border border-dashed border-sand-300 bg-white px-4 py-6 text-center text-sm text-sand-600"
	>
		Sin personas registradas.
	</p>
{:else}
	<div class="mt-3">
		<DataTable
			columns={["Nombre", "Roles", "Contacto", "Puede recoger", ""]}
			items={data.contactos}
		>
			{#snippet row(contacto)}
				<td class="px-4 py-2.5 font-medium text-sand-950">
					{contacto.nombre}
					{#if contacto.identificacion}
						<span class="block text-xs font-normal text-sand-500">{contacto.identificacion}</span>
					{/if}
				</td>
				<td class="px-4 py-2.5">
					<div class="flex flex-wrap gap-1">
						{#each contacto.roles as rol (rol)}
							<Badge tone={rol === "entregador" || rol === "autorizador" ? "brand" : "neutral"}>
								{contacto.rolesLabel[contacto.roles.indexOf(rol)]}
							</Badge>
						{:else}
							<span class="text-xs text-sand-400">—</span>
						{/each}
					</div>
				</td>
				<td class="px-4 py-2.5 text-sand-600">{contacto.telefono ?? contacto.email ?? "—"}</td>
				<td class="px-4 py-2.5 text-sand-600">
					{#if !contacto.roles.includes("entregador")}
						<span class="text-sand-400">No autorizado</span>
					{:else if contacto.alcanceUnidades === "todas"}
						Todas las unidades
					{:else}
						{contacto.unidadesAutorizadas.length} unidad(es)
					{/if}
				</td>
				<td class="px-4 py-2.5 text-right">
					{#if data.puede.contactos}
						<div class="flex justify-end gap-1">
							<Button
								href={searchHref(page.url, { drawer: "contacto", contacto: contacto.id })}
								variant="ghost"
								size="sm"
							>
								<Pencil
									size={14}
									aria-hidden="true"
								/>
								Editar
							</Button>
							<form
								method="POST"
								action="?/eliminarContacto"
							>
								<input
									type="hidden"
									name="contactoId"
									value={contacto.id}
								/>
								<Button
									variant="ghost"
									size="sm"
								>
									<Trash2
										size={14}
										aria-hidden="true"
									/>
									Quitar
								</Button>
							</form>
						</div>
					{/if}
				</td>
			{/snippet}
		</DataTable>
	</div>
{/if}

<!-- Unidades -->
<div class="mt-10 flex flex-wrap items-center gap-3">
	<h2 class="font-display text-xl text-sand-950">Unidades</h2>
	{#if data.puede.crearUnidad && !data.cliente.archivado}
		<Button
			href={searchHref(page.url, { drawer: "unidad" })}
			size="sm"
			class="ml-auto"
		>
			<CarFront
				size={16}
				aria-hidden="true"
			/>
			Registrar unidad
		</Button>
	{/if}
</div>

{#if data.unidades.length === 0}
	<p
		class="mt-3 rounded-lg border border-dashed border-sand-300 bg-white px-4 py-6 text-center text-sm text-sand-600"
	>
		Sin unidades registradas.
	</p>
{:else}
	<div class="mt-3">
		<DataTable
			columns={["Unidad", "Placas", "VIN", "Económico", "Km", ""]}
			items={data.unidades}
		>
			{#snippet row(unidad)}
				<td class="px-4 py-2.5 font-medium text-sand-950">
					{unidad.marca}
					{unidad.modelo}{unidad.anio ? ` ${unidad.anio}` : ""}
					{#if unidad.archivado}
						<span class="ml-2"><Badge tone="neutral">archivada</Badge></span>
					{/if}
				</td>
				<td class="px-4 py-2.5 text-sand-600">{unidad.placas ?? "—"}</td>
				<td class="px-4 py-2.5 font-mono text-xs text-sand-600">{unidad.vin ?? "—"}</td>
				<td class="px-4 py-2.5 text-sand-600">{unidad.numeroEconomico ?? "—"}</td>
				<td class="px-4 py-2.5 text-sand-600">{unidad.kilometraje ?? "—"}</td>
				<td class="px-4 py-2.5 text-right">
					<Button
						href="/panel/unidades/{unidad.id}"
						variant="ghost"
						size="sm">Ver</Button
					>
				</td>
			{/snippet}
		</DataTable>
	</div>
{/if}

<!-- Drawers -->
{#if drawer === "editar" && data.puede.editar}
	<Drawer
		title="Editar cliente"
		description={data.cliente.nombreCompleto}
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/editar"
			class="space-y-4"
		>
			<Field
				label="Tipo"
				name="tipo"
			>
				{#snippet children(id)}
					<select
						{id}
						name="tipo"
						value={tipo}
						onchange={(e) => (tipoElegido = e.currentTarget.value as "persona" | "organizacion")}
						required
						class={INPUT}
					>
						{#each data.tipos as t (t.value)}
							<option value={t.value}>{t.label}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			{#if tipo === "persona"}
				<Field
					label="Nombre"
					name="nombre"
					required
					value={data.cliente.nombre ?? ""}
				/>
				<Field
					label="Apellidos"
					name="apellidos"
					value={data.cliente.apellidos ?? ""}
				/>
			{:else}
				<Field
					label="Razón social"
					name="razonSocial"
					required
					value={data.cliente.razonSocial ?? ""}
				/>
			{/if}
			<Field
				label="Teléfono"
				name="telefono"
				type="tel"
				value={data.cliente.telefono ?? ""}
			/>
			<Field
				label="Correo"
				name="email"
				type="email"
				value={data.cliente.email ?? ""}
			/>
			<Field
				label="Dirección"
				name="direccion"
				value={data.cliente.direccion ?? ""}
			/>
			<Field
				label="RFC"
				name="rfc"
				value={data.cliente.rfc ?? ""}
			/>
			<SatSelect
				label="Régimen fiscal"
				name="regimenFiscal"
				catalogo={REGIMENES_FISCALES}
				{tipo}
				value={data.cliente.regimenFiscal}
			/>
			<Field
				label="Código postal"
				name="codigoPostal"
				value={data.cliente.codigoPostal ?? ""}
			/>
			<SatSelect
				label="Uso CFDI"
				name="usoCfdi"
				catalogo={USOS_CFDI}
				{tipo}
				value={data.cliente.usoCfdi}
			/>
			<Field
				label="Notas"
				name="notas"
				value={data.cliente.notas ?? ""}
			/>
			<Button full>Guardar</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "contacto" && data.puede.contactos}
	<Drawer
		title={editando ? "Editar persona" : "Agregar persona"}
		description={data.cliente.nombreCompleto}
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action={editando ? "?/editarContacto" : "?/crearContacto"}
			class="space-y-4"
		>
			{#if editando}
				<input
					type="hidden"
					name="contactoId"
					value={editando.id}
				/>
			{/if}

			<Field
				label="Nombre"
				name="nombre"
				required
				value={editando?.nombre ?? ""}
			/>
			<Field
				label="Teléfono"
				name="telefono"
				type="tel"
				value={editando?.telefono ?? ""}
			/>
			<Field
				label="Correo"
				name="email"
				type="email"
				value={editando?.email ?? ""}
			/>
			<Field
				label="Identificación"
				name="identificacion"
				value={editando?.identificacion ?? ""}
				hint="Para verificarla en el mostrador. Ej. INE 1234. No guardes fotos de documentos."
			/>

			<fieldset>
				<legend class="text-sm font-medium text-sand-700">Roles</legend>
				<div class="mt-2 space-y-2">
					{#each data.rolesDisponibles as rol (rol.value)}
						<label class="flex items-start gap-2.5 text-sm">
							<input
								type="checkbox"
								name="roles"
								value={rol.value}
								checked={editando?.roles.includes(rol.value)}
								class="mt-0.5 size-4 shrink-0 rounded border-sand-300 accent-brand-600"
							/>
							<span>
								<span class="font-medium text-sand-950">{rol.label}</span>
								{#if rol.autoridad}
									<ShieldCheck
										size={13}
										class="ml-1 inline text-brand-600"
										aria-label="Rol con autoridad"
									/>
								{/if}
								<span class="block text-xs text-sand-500">{rol.descripcion}</span>
							</span>
						</label>
					{/each}
				</div>
				{#if !data.puede.otorgarAutoridad}
					<p
						class="mt-2 rounded border border-accent-500/60 bg-accent-500/15 px-3 py-2 text-xs text-sand-800"
					>
						Solo un Gerente o Admin puede marcar a alguien como <strong>Entregador</strong> o
						<strong>Autorizador</strong>, porque esos roles permiten llevarse una unidad o autorizar gastos.
					</p>
				{/if}
			</fieldset>

			<Field
				label="Puede recoger"
				name="alcanceUnidades"
			>
				{#snippet children(id)}
					<select
						{id}
						name="alcanceUnidades"
						value={alcance}
						onchange={(e) => (alcanceElegido = e.currentTarget.value as "todas" | "especificas")}
						class={INPUT}
					>
						<option value="todas">Todas las unidades del cliente</option>
						<option value="especificas">Solo unidades específicas</option>
					</select>
				{/snippet}
			</Field>

			{#if alcance === "especificas"}
				<fieldset>
					<legend class="text-sm font-medium text-sand-700">Unidades autorizadas</legend>
					{#if activas.length === 0}
						<p class="mt-1 text-xs text-sand-500">Este cliente todavía no tiene unidades.</p>
					{:else}
						<div class="mt-2 space-y-1.5">
							{#each activas as unidad (unidad.id)}
								<label class="flex items-center gap-2.5 text-sm text-sand-800">
									<input
										type="checkbox"
										name="unidades"
										value={unidad.id}
										checked={editando?.unidadesAutorizadas.includes(unidad.id)}
										class="size-4 rounded border-sand-300 accent-brand-600"
									/>
									{unidad.etiqueta}
								</label>
							{/each}
						</div>
					{/if}
				</fieldset>
			{/if}

			<Field
				label="Notas"
				name="notas"
				value={editando?.notas ?? ""}
			/>
			<Button full>{editando ? "Guardar" : "Agregar persona"}</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "unidad" && data.puede.crearUnidad}
	<Drawer
		title="Registrar unidad"
		description="Solo marca y modelo son obligatorios."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/crearUnidad"
			class="space-y-4"
		>
			<Field
				label="Marca"
				name="marca"
				required
			/>
			<Field
				label="Modelo"
				name="modelo"
				required
			/>
			<Field
				label="Año"
				name="anio"
				type="number"
			/>
			<Field
				label="Color"
				name="color"
			/>
			<Field
				label="Placas"
				name="placas"
			/>
			<Field
				label="VIN / NIV"
				name="vin"
				hint="Único en todo el sistema cuando se captura."
			/>
			<Field
				label="Número económico"
				name="numeroEconomico"
				hint="El número que la flotilla pinta en la puerta."
			/>
			<Field
				label="Kilometraje"
				name="kilometraje"
				type="number"
			/>
			<Field
				label="Notas"
				name="notas"
			/>
			<Button full>Registrar unidad</Button>
		</form>
	</Drawer>
{/if}
