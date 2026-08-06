<script lang="ts">
	import Wrench from "@lucide/svelte/icons/wrench";
	import Plus from "@lucide/svelte/icons/plus";
	import Search from "@lucide/svelte/icons/search";
	import Archive from "@lucide/svelte/icons/archive";
	import ArchiveRestore from "@lucide/svelte/icons/archive-restore";
	import Building2 from "@lucide/svelte/icons/building-2";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Star from "@lucide/svelte/icons/star";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import { TALLER_ESTADOS, tallerEstadoTono } from "$lib/talleres";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const drawer = $derived(page.url.searchParams.get("drawer"));
	const editando = $derived(data.talleres.find((t) => t.id === page.url.searchParams.get("taller")));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null, taller: null, sucursal: null }));

	const sucursalEditando = $derived(
		data.detalle?.sucursales?.find((s) => s.id === page.url.searchParams.get("sucursal")),
	);

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";
</script>

<svelte:head><title>Talleres aliados — Estación 360</title></svelte:head>

<PageHeader
	title="Talleres aliados"
	description="Los talleres certificados a los que Estación 360 les manda trabajo."
>
	{#snippet actions()}
		{#if data.puede.gestionar}
			<Button href={searchHref(page.url, { drawer: "nuevo" })}>
				<Plus size={18} aria-hidden="true" />
				Dar de alta
			</Button>
		{/if}
	{/snippet}
</PageHeader>

{#if form?.message}
	<p role="alert" class="mb-4 rounded border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-900">
		{form.message}
	</p>
{/if}

{#if data.puede.revisar && data.porRevisar > 0 && data.filtros.estado !== "solicitado"}
	<!-- The queue is the thing that goes stale if nobody looks at it, so it announces itself. -->
	<p class="mb-4 flex flex-wrap items-center gap-2 rounded border border-accent-500 bg-accent-500/15 px-3 py-2 text-sm text-sand-900">
		Hay {data.porRevisar} taller(es) esperando revisión.
		<a class="font-bold underline" href={searchHref(page.url, { estado: "solicitado", page: null })}>
			Revisarlos
		</a>
	</p>
{/if}

<form method="GET" class="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-sand-200 bg-white p-4">
	<div class="min-w-48 flex-1">
		<Field label="Buscar" name="q" value={data.filtros.q} placeholder="Nombre, contacto, ciudad, especialidad…" />
	</div>
	{#if data.filtros.archivados}<input type="hidden" name="archivados" value="1" />{/if}
	{#if data.filtros.estado}<input type="hidden" name="estado" value={data.filtros.estado} />{/if}
	<Button size="sm">
		<Search size={16} aria-hidden="true" />
		Buscar
	</Button>
	<Button
		href={searchHref(page.url, { archivados: data.filtros.archivados ? null : "1" })}
		variant={data.filtros.archivados ? "primary" : "ghost"}
		size="sm"
	>
		Ver archivados
	</Button>
</form>

{#if data.puede.revisar}
	<div class="mb-4 flex flex-wrap gap-1">
		<Button
			href={searchHref(page.url, { estado: null, page: null })}
			variant={data.filtros.estado ? "ghost" : "primary"}
			size="sm">Todos</Button
		>
		{#each Object.entries(TALLER_ESTADOS) as [key, def] (key)}
			<Button
				href={searchHref(page.url, { estado: key, page: null })}
				variant={data.filtros.estado === key ? "primary" : "ghost"}
				size="sm"
			>
				{def.label}{key === "solicitado" && data.porRevisar > 0 ? ` (${data.porRevisar})` : ""}
			</Button>
		{/each}
	</div>
{/if}

{#if data.talleres.length === 0}
	<EmptyState
		title={data.filtros.estado === "solicitado" ? "Nada por revisar" : "Todavía no hay talleres aliados"}
		description="Los talleres se dan de alta aquí o se registran solos desde /talleres y tú los certificas."
	>
		{#snippet icon()}<Wrench size={40} aria-hidden="true" />{/snippet}
	</EmptyState>
{:else}
	<DataTable columns={["Taller", "Contacto", "Especialidades", "Unidades", ""]} items={data.talleres}>
		{#snippet row(taller)}
			<td class="px-4 py-2.5">
				<span class="block font-medium text-sand-950">{taller.nombre}</span>
				<span class="mt-0.5 flex flex-wrap items-center gap-1">
					<Badge tone={tallerEstadoTono(taller.estado)}>{taller.estadoLabel}</Badge>
					{#if taller.origen === "publico"}<Badge tone="brand">Se registró solo</Badge>{/if}
					{#if taller.archivado}<Badge tone="neutral">Archivado</Badge>{/if}
				</span>
				{#if taller.ciudad || taller.direccion}
					<span class="block text-xs text-sand-500">{taller.ciudad ?? taller.direccion}</span>
				{/if}
			</td>
			<td class="px-4 py-2.5">
				{#if taller.contacto}<span class="block text-sand-950">{taller.contacto}</span>{/if}
				{#if taller.telefono}
					<a class="block text-xs text-brand-700 hover:underline" href="tel:{taller.telefono}">{taller.telefono}</a>
				{/if}
			</td>
			<td class="px-4 py-2.5 text-sand-600">{taller.especialidades ?? "—"}</td>
			<td class="px-4 py-2.5 text-sand-600">{taller.notasRecibidas}</td>
			<td class="px-4 py-2.5 text-right">
				<span class="flex flex-wrap justify-end gap-1">
					{#if data.puede.revisar && taller.estado === "solicitado"}
						<Button href={searchHref(page.url, { drawer: "revisar", taller: taller.id })} size="sm">
							Revisar
						</Button>
					{/if}
					{#if data.puede.gestionar}
						<Button
							href={searchHref(page.url, { drawer: "sucursales", taller: taller.id })}
							variant="ghost"
							size="sm"
						>
							<Building2 size={15} aria-hidden="true" />
							Sucursales
						</Button>
						<Button href={searchHref(page.url, { drawer: "editar", taller: taller.id })} variant="ghost" size="sm">
							<Pencil size={15} aria-hidden="true" />
							Editar
						</Button>
						<form method="POST" action="?/archivar">
							<input type="hidden" name="id" value={taller.id} />
							<input type="hidden" name="archivado" value={taller.archivado ? "0" : "1"} />
							<Button variant="ghost" size="sm">
								{#if taller.archivado}
									<ArchiveRestore size={15} aria-hidden="true" />
									Reactivar
								{:else}
									<Archive size={15} aria-hidden="true" />
									Archivar
								{/if}
							</Button>
						</form>
					{/if}
				</span>
			</td>
		{/snippet}
	</DataTable>
{/if}

{#if (drawer === "nuevo" || drawer === "editar") && data.puede.gestionar}
	{@const t = drawer === "editar" ? editando : null}
	<Drawer
		title={t ? "Editar taller" : "Dar de alta un taller"}
		description="Un taller dado de alta aquí queda certificado: darlo de alta ES la decisión."
		closeHref={closeDrawer}
	>
		<form method="POST" action={t ? "?/editar" : "?/crear"} class="space-y-4">
			{#if t}<input type="hidden" name="id" value={t.id} />{/if}
			<Field label="Nombre" name="nombre" required value={t?.nombre ?? ""} />
			<Field label="Persona de contacto" name="contacto" value={t?.contacto ?? ""} />
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field label="Teléfono" name="telefono" type="tel" value={t?.telefono ?? ""} />
				<Field label="Ciudad" name="ciudad" value={t?.ciudad ?? ""} />
			</div>
			<Field label="Correo" name="email" type="email" value={t?.email ?? ""} />
			<Field label="Dirección" name="direccion" value={t?.direccion ?? ""} />
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field label="RFC" name="rfc" value={t?.rfc ?? ""} />
				<Field label="Sitio web" name="sitioWeb" value={t?.sitioWeb ?? ""} />
			</div>
			<Field
				label="Especialidades"
				name="especialidades"
				value={t?.especialidades ?? ""}
				hint="Hojalatería, pintura, transmisiones…"
			/>
			<Field label="Notas" name="notas">
				{#snippet children(id)}
					<textarea {id} name="notas" rows="2" class={INPUT}>{t?.notas ?? ""}</textarea>
				{/snippet}
			</Field>
			<Button full>{t ? "Guardar" : "Dar de alta"}</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "revisar" && data.puede.revisar && data.detalle}
	{@const t = data.detalle}
	<Drawer
		title="Revisar solicitud"
		description="Certificarlo es lo que lo hace elegible para recibir una unidad."
		closeHref={closeDrawer}
	>
		<dl class="space-y-3 text-sm">
			<div>
				<dt class="text-xs text-sand-500">Taller</dt>
				<dd class="font-medium text-sand-950">{t.nombre}</dd>
			</div>
			<div>
				<dt class="text-xs text-sand-500">Contacto</dt>
				<dd class="text-sand-800">
					{t.contacto ?? "—"}
					{#if t.telefono}· <a class="text-brand-700 hover:underline" href="tel:{t.telefono}">{t.telefono}</a>{/if}
				</dd>
			</div>
			{#if t.email}
				<div>
					<dt class="text-xs text-sand-500">Correo</dt>
					<dd class="text-sand-800">{t.email}</dd>
				</div>
			{/if}
			<div>
				<dt class="text-xs text-sand-500">Dónde están</dt>
				<dd class="text-sand-800">{[t.direccion, t.ciudad].filter(Boolean).join(", ") || "—"}</dd>
			</div>
			<div>
				<dt class="text-xs text-sand-500">Especialidades</dt>
				<dd class="text-sand-800">{t.especialidades ?? "—"}</dd>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<dt class="text-xs text-sand-500">Años operando</dt>
					<dd class="text-sand-800">{t.anosOperando ?? "—"}</dd>
				</div>
				<div>
					<dt class="text-xs text-sand-500">Empleados</dt>
					<dd class="text-sand-800">{t.empleados ?? "—"}</dd>
				</div>
			</div>
			{#if t.rfc || t.sitioWeb}
				<div>
					<dt class="text-xs text-sand-500">RFC / sitio</dt>
					<dd class="text-sand-800">{[t.rfc, t.sitioWeb].filter(Boolean).join(" · ")}</dd>
				</div>
			{/if}
			{#if t.notas}
				<div>
					<dt class="text-xs text-sand-500">Lo que nos dijeron</dt>
					<dd class="whitespace-pre-line text-sand-800">{t.notas}</dd>
				</div>
			{/if}
		</dl>

		<form method="POST" action="?/revisar" class="mt-6 space-y-4 border-t border-sand-200 pt-5">
			<input type="hidden" name="id" value={t.id} />
			<Button name="estado" value="aprobado" full>Certificar como taller aliado</Button>

			<div class="rounded border border-sand-200 p-3">
				<Field label="Motivo del rechazo" name="motivo" hint="Se le explica al taller. Obligatorio para rechazar." />
				<div class="mt-3">
					<Button name="estado" value="rechazado" variant="outline" size="sm" full>Rechazar</Button>
				</div>
			</div>
		</form>
	</Drawer>
{/if}

{#if drawer === "sucursales" && data.puede.gestionar && data.detalle}
	{@const t = data.detalle}
	{@const s = sucursalEditando}
	<Drawer
		title="Sucursales"
		description="{t.nombre} — cada sucursal con su propio responsable."
		closeHref={closeDrawer}
	>
		{#if t.sucursales && t.sucursales.length > 0}
			<ul class="mb-6 space-y-2">
				{#each t.sucursales as suc (suc.id)}
					<li class="rounded border border-sand-200 p-3 {suc.archivado ? 'opacity-60' : ''}">
						<p class="flex flex-wrap items-center gap-1.5 text-sm font-medium text-sand-950">
							{suc.nombre}
							{#if suc.esPrincipal}
								<span class="inline-flex items-center gap-1 text-xs font-normal text-accent-700">
									<Star size={12} aria-hidden="true" />
									Matriz
								</span>
							{/if}
							{#if suc.archivado}<Badge tone="neutral">Archivada</Badge>{/if}
						</p>
						{#if suc.direccion || suc.ciudad}
							<p class="text-xs text-sand-500">{[suc.direccion, suc.ciudad].filter(Boolean).join(", ")}</p>
						{/if}
						{#if suc.contactoNombre}
							<p class="mt-1 text-xs text-sand-600">
								{suc.contactoNombre}{suc.contactoPuesto ? ` · ${suc.contactoPuesto}` : ""}
								{#if suc.contactoTelefono}
									· <a class="text-brand-700 hover:underline" href="tel:{suc.contactoTelefono}"
										>{suc.contactoTelefono}</a
									>
								{/if}
							</p>
						{/if}
						<div class="mt-2 flex flex-wrap gap-1">
							<Button
								href={searchHref(page.url, { drawer: "sucursales", taller: t.id, sucursal: suc.id })}
								variant="ghost"
								size="sm"
							>
								<Pencil size={14} aria-hidden="true" />
								Editar
							</Button>
							<form method="POST" action="?/archivarSucursal">
								<input type="hidden" name="id" value={suc.id} />
								<input type="hidden" name="tallerId" value={t.id} />
								<input type="hidden" name="archivado" value={suc.archivado ? "0" : "1"} />
								<Button variant="ghost" size="sm">{suc.archivado ? "Reactivar" : "Archivar"}</Button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			method="POST"
			action={s ? "?/editarSucursal" : "?/crearSucursal"}
			class="space-y-4 border-t border-sand-200 pt-5"
		>
			<h3 class="font-display text-base text-sand-950">{s ? `Editar ${s.nombre}` : "Agregar sucursal"}</h3>
			<input type="hidden" name="tallerId" value={t.id} />
			{#if s}<input type="hidden" name="id" value={s.id} />{/if}

			<Field label="Nombre de la sucursal" name="nombre" required value={s?.nombre ?? ""} />
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field label="Ciudad" name="ciudad" value={s?.ciudad ?? ""} />
				<Field label="Teléfono" name="telefono" type="tel" value={s?.telefono ?? ""} />
			</div>
			<Field label="Dirección" name="direccion" value={s?.direccion ?? ""} />

			<fieldset class="rounded border border-sand-200 p-3">
				<legend class="px-1 text-xs font-medium text-sand-500">Responsable de esta sucursal</legend>
				<Field label="Nombre" name="contactoNombre" value={s?.contactoNombre ?? ""} />
				<div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field label="Puesto" name="contactoPuesto" value={s?.contactoPuesto ?? ""} />
					<Field label="Teléfono" name="contactoTelefono" type="tel" value={s?.contactoTelefono ?? ""} />
				</div>
				<div class="mt-3">
					<Field label="Correo" name="contactoEmail" type="email" value={s?.contactoEmail ?? ""} />
				</div>
			</fieldset>

			<label class="flex cursor-pointer items-center gap-2 py-1.5 text-sm text-sand-700">
				<input type="checkbox" name="esPrincipal" checked={s?.esPrincipal ?? false} class="size-4 accent-brand-600" />
				Es la matriz
			</label>

			<Button full>{s ? "Guardar sucursal" : "Agregar sucursal"}</Button>
			{#if s}
				<Button href={searchHref(page.url, { sucursal: null })} variant="ghost" size="sm" full>Cancelar</Button>
			{/if}
		</form>
	</Drawer>
{/if}
