<!--
	One job, as the mechanic works it. Phone-first: one column, big targets, the primary action at
	the bottom where a thumb reaches.

	No money on this screen at all — not the quote, not the customer's balance. The data arrives
	through `notaParaTaller`, so there is nothing here to accidentally render.
-->
<script lang="ts">
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import Camera from "@lucide/svelte/icons/camera";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import Fuel from "@lucide/svelte/icons/fuel";
	import Gauge from "@lucide/svelte/icons/gauge";
	import MessageSquare from "@lucide/svelte/icons/message-square";
	import Package from "@lucide/svelte/icons/package";
	import Search from "@lucide/svelte/icons/search";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import EvidenciaSubir from "$lib/components/EvidenciaSubir.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { FOTO_CATEGORIAS, notaEstadoTone } from "$lib/notas";
	import { solicitudEstadoLabel, solicitudEstadoTone } from "$lib/inventario";
	import { haceCuanto } from "$lib/notificaciones";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const n = $derived(data.nota);
	const drawer = $derived(page.url.searchParams.get("drawer"));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null, q: null }));

	const categorias = Object.entries(FOTO_CATEGORIAS).map(([value, def]) => ({ value, label: def.label }));

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";
</script>

<svelte:head><title>Nota #{n.folio} — Mi trabajo</title></svelte:head>

<Button
	href="/panel/taller"
	variant="ghost"
	size="sm"
>
	<ArrowLeft
		size={16}
		aria-hidden="true"
	/>
	Mi trabajo
</Button>

<div class="mt-2">
	<PageHeader
		title={n.unidad ?? `Nota #${n.folio}`}
		description={n.unidadDetalle ?? undefined}
	/>
</div>

<p class="mt-2 flex flex-wrap items-center gap-2">
	<Badge tone={notaEstadoTone(n.estado)}>{n.estadoLabel}</Badge>
	{#if n.trabajoTerminadoAt}
		<Badge tone="ok">Trabajo terminado</Badge>
	{/if}
	<span class="text-xs text-sand-500">#{n.folio}</span>
</p>

<Flash {form} />

<div class="mt-5 space-y-4">
	<!--
		What the vehicle came in for, and — for an outside shop's mechanic — what WE asked them to
		do. Two different facts: the customer's complaint is the context, the transfer motivo is the
		job. Nothing here identifies the customer; `notaParaTaller` carries no name, phone or price.
	-->
	{#if n.motivoTaller}
		<section class="rounded-lg border-2 border-brand-200 bg-brand-50 p-4">
			<h2 class="text-xs font-medium uppercase tracking-wide text-brand-800">Lo que se les encargó</h2>
			<p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-sand-900">{n.motivoTaller}</p>
		</section>
	{/if}

	<section class="rounded-lg border border-sand-200 bg-white p-4">
		<h2 class="text-xs font-medium uppercase tracking-wide text-sand-500">Qué reportó el cliente</h2>
		<p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-sand-900">{n.motivo}</p>

		<div class="mt-3 flex flex-wrap gap-4 text-xs text-sand-600">
			{#if n.kilometraje !== null}
				<span class="flex items-center gap-1.5">
					<Gauge
						size={14}
						aria-hidden="true"
					/>
					{n.kilometraje.toLocaleString("es-MX")} km
				</span>
			{/if}
			{#if n.combustibleLabel}
				<span class="flex items-center gap-1.5">
					<Fuel
						size={14}
						aria-hidden="true"
					/>
					{n.combustibleLabel}
				</span>
			{/if}
			{#if !n.inspeccionada}
				<span class="text-accent-700">Sin inspección de entrada</span>
			{/if}
		</div>

		{#if n.condicion}
			<p class="mt-3 rounded border border-sand-200 bg-sand-50 p-2.5 text-xs leading-relaxed text-sand-700">
				<span class="font-medium">Cómo llegó:</span>
				{n.condicion}
			</p>
		{/if}
	</section>

	<!-- Diagnóstico: the mechanic's main job on this screen, so it sits above everything else. -->
	<section class="rounded-lg border border-sand-200 bg-white p-4">
		<h2 class="font-display text-lg text-sand-950">Qué encontré / qué le hice</h2>
		<form
			method="POST"
			action="?/diagnostico"
			class="mt-3 space-y-3"
		>
			<Field
				label="Diagnóstico"
				name="diagnostico"
			>
				{#snippet children(id)}
					<textarea
						{id}
						name="diagnostico"
						rows="5"
						class={INPUT}
						placeholder="Balatas delanteras al límite, disco rayado. Cambié balatas y rectifiqué discos."
						>{n.diagnostico ?? ""}</textarea
					>
				{/snippet}
			</Field>

			<!-- Two buttons, one form: same field, different intent. Mobile-first stack. -->
			<div class="flex flex-col gap-2 sm:flex-row">
				<Button
					name="terminado"
					value=""
					variant="outline"
					full>Guardar</Button
				>
				{#if n.trabajoTerminadoAt}
					<Button
						name="terminado"
						value="0"
						variant="ghost"
						full>Reabrir mi trabajo</Button
					>
				{:else}
					<Button
						name="terminado"
						value="1"
						full
					>
						<CircleCheck
							size={18}
							aria-hidden="true"
						/>
						Terminé mi trabajo
					</Button>
				{/if}
			</div>
			<p class="text-xs text-sand-500">
				Al terminar se le avisa al mostrador. Ellos deciden cuándo se le entrega al cliente.
			</p>
		</form>
	</section>

	<!-- Refacciones -->
	<section class="rounded-lg border border-sand-200 bg-white p-4">
		<div class="flex flex-wrap items-center gap-2">
			<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
				<Package
					size={18}
					aria-hidden="true"
				/>
				Refacciones
			</h2>
			<Button
				href={searchHref(page.url, { drawer: "refaccion" })}
				size="sm"
				class="ml-auto">Pedir</Button
			>
		</div>

		{#if data.solicitudes.length === 0}
			<p class="mt-2 text-sm text-sand-500">No has pedido nada para esta unidad.</p>
		{:else}
			<ul class="mt-3 space-y-2">
				{#each data.solicitudes as s (s.id)}
					<li class="rounded border border-sand-200 p-2.5">
						<p class="flex flex-wrap items-center gap-2 text-sm">
							<span class="font-medium text-sand-900">{s.cantidad} × {s.descripcion}</span>
							<Badge tone={solicitudEstadoTone(s.estado)}>{solicitudEstadoLabel(s.estado)}</Badge>
						</p>
						{#if s.resolucionMotivo}
							<p class="mt-1 text-xs text-sand-600">{s.resolucionMotivo}</p>
						{/if}
						<p class="mt-0.5 text-xs text-sand-500">{haceCuanto(s.createdAt)}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Evidencia -->
	<section class="rounded-lg border border-sand-200 bg-white p-4">
		<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
			<Camera
				size={18}
				aria-hidden="true"
			/>
			Fotos
			<span class="text-sm font-normal text-sand-500">({data.evidencias.length})</span>
		</h2>

		{#if data.evidencias.length > 0}
			<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each data.evidencias as e (e.id)}
					<a
						href={e.url}
						target="_blank"
						rel="noopener"
						class="block overflow-hidden rounded border border-sand-200"
					>
						<img
							src={e.url}
							alt={e.descripcion ?? e.nombre}
							class="h-24 w-full object-cover"
							loading="lazy"
						/>
						<!-- Visible, not just in `alt`: a note on a photo exists to be read later. -->
						{#if e.descripcion}
							<span
								class="line-clamp-2 px-1.5 py-1 text-[11px] leading-tight text-sand-700"
								title={e.descripcion}
							>
								{e.descripcion}
							</span>
						{/if}
					</a>
				{/each}
			</div>
		{/if}

		{#if data.r2}
			<div class="mt-3">
				<EvidenciaSubir
					notaId={n.id}
					{categorias}
				/>
			</div>
		{:else}
			<p class="mt-2 text-xs text-sand-500">La subida de fotos no está configurada todavía.</p>
		{/if}
	</section>

	<!-- Comentarios -->
	<section class="rounded-lg border border-sand-200 bg-white p-4">
		<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
			<MessageSquare
				size={18}
				aria-hidden="true"
			/>
			Notas del trabajo
		</h2>

		{#if data.comentarios.length > 0}
			<ul class="mt-3 space-y-2">
				{#each data.comentarios as c (c.id)}
					<li class="border-l-2 border-sand-200 pl-3">
						<p class="text-sm leading-relaxed text-sand-800">{c.texto}</p>
						<p class="mt-0.5 text-xs text-sand-500">{c.autorEmail} · {haceCuanto(c.createdAt)}</p>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			method="POST"
			action="?/comentar"
			class="mt-3 space-y-2"
		>
			<Field
				label="Agregar una nota"
				name="texto"
			>
				{#snippet children(id)}
					<textarea
						{id}
						name="texto"
						required
						rows="2"
						class={INPUT}
						placeholder="Falta torque final, pendiente prueba de camino"
					></textarea>
				{/snippet}
			</Field>
			<Button
				variant="outline"
				size="sm"
				full>Guardar nota</Button
			>
			<p class="text-xs text-sand-500">Estas notas son internas. El cliente nunca las ve.</p>
		</form>
	</section>
</div>

{#if drawer === "refaccion"}
	<Drawer
		title="Pedir una refacción"
		description="El mostrador la surte o te dice que no hay."
		closeHref={closeDrawer}
	>
		<!-- Search is its own GET form, so it works with JavaScript off. -->
		<form
			method="GET"
			class="mb-4 flex items-end gap-2"
		>
			<input
				type="hidden"
				name="drawer"
				value="refaccion"
			/>
			<div class="flex-1">
				<Field
					label="Buscar en el almacén"
					name="q"
					value={data.q}
					placeholder="balata, filtro, aceite…"
				/>
			</div>
			<Button size="sm">
				<Search
					size={16}
					aria-hidden="true"
				/>
			</Button>
		</form>

		<form
			method="POST"
			action="?/refaccion"
			class="space-y-4"
		>
			{#if data.productos.length > 0}
				<fieldset class="space-y-1.5">
					<legend class="text-xs font-medium text-sand-500">Del almacén (opcional)</legend>
					{#each data.productos as p (p.id)}
						<label
							class="flex cursor-pointer items-start gap-2.5 rounded border border-sand-200 p-3 hover:border-brand-600"
						>
							<input
								type="radio"
								name="productoId"
								value={p.id}
								class="mt-0.5 size-4 shrink-0 accent-brand-600"
							/>
							<span class="min-w-0 flex-1">
								<span class="block text-sm font-medium text-sand-950">{p.nombre}</span>
								<span class="block text-xs {p.hay ? 'text-sand-500' : 'text-danger'}">
									{p.hay ? `Hay ${p.existencia} ${p.unidad}` : "Sin existencia"}
									{#if p.sku}· {p.sku}{/if}
								</span>
							</span>
						</label>
					{/each}
					<!-- Radios cannot be unpicked, so "none of these" has to be an option or the first
					     tap is permanent for a no-JS user. -->
					<label
						class="flex cursor-pointer items-center gap-2.5 rounded border border-dashed border-sand-300 p-3"
					>
						<input
							type="radio"
							name="productoId"
							value=""
							checked
							class="size-4 shrink-0 accent-brand-600"
						/>
						<span class="text-sm text-sand-600">Ninguna de estas / no está en el almacén</span>
					</label>
				</fieldset>
			{/if}

			<Field
				label="¿Qué necesitas?"
				name="descripcion"
				required
				hint="Descríbelo aunque no esté en el almacén."
				placeholder="Balatas delanteras Hilux 2019"
			/>
			<Field
				label="Cantidad"
				name="cantidad"
				type="number"
				step="0.001"
				min="0.001"
				value="1"
				required
			/>

			<Button full>Pedir</Button>
		</form>
	</Drawer>
{/if}
