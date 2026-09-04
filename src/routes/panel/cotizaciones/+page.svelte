<script lang="ts">
	import ReceiptText from "@lucide/svelte/icons/receipt-text";
	import FileText from "@lucide/svelte/icons/file-text";
	import Search from "@lucide/svelte/icons/search";
	import Printer from "@lucide/svelte/icons/printer";
	import Stamp from "@lucide/svelte/icons/stamp";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import Mail from "@lucide/svelte/icons/mail";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import StatCard from "$lib/components/StatCard.svelte";
	import {
		cotizacionEstadoTone,
		cotizacionInternoTone,
		facturaEstadoTone,
		formatoPesos,
		condicionPagoLabel,
		vencimientoLabel,
		vencimientoTone,
	} from "$lib/comercial";
	import { hoy, sumarDias } from "$lib/agenda";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const enFacturas = $derived(data.pestana === "facturas");
	const totalPaginas = $derived(enFacturas ? data.facturasPages : data.totalPages);

	// Shortcuts for the windows a shop actually asks about. Plain links, so they are shareable and
	// work with JavaScript off like every other filter here.
	const rango = (dias: number) => searchHref(page.url, { desde: sumarDias(hoy(), -dias), hasta: hoy(), page: null });
	const esteMes = () => searchHref(page.url, { desde: `${hoy().slice(0, 7)}-01`, hasta: hoy(), page: null });

	const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
</script>

<svelte:head><title>Dinero — Estación 360</title></svelte:head>

<PageHeader
	title="Dinero"
	description="Lo cotizado, lo autorizado, lo facturado y lo que sí entró."
/>

<Flash {form} />

<!--
	The four numbers, in the order money moves through the shop: quoted → approved → invoiced →
	collected. `porCobrar` sits beside them because it is the only one that is a problem rather than
	a result, and `vencido` is the part of it that is somebody's job today.
-->
<div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
	<StatCard
		label="Cotizado"
		value={formatoPesos(Number(data.dinero.cotizado))}
		hint="{data.dinero.cotizadas} cotizaciones"
	/>
	<StatCard
		label="Autorizado"
		value={formatoPesos(Number(data.dinero.autorizado))}
		hint="{data.dinero.autorizadas} aprobadas por el cliente"
	/>
	<StatCard
		label="Facturado"
		value={formatoPesos(Number(data.dinero.facturado))}
		hint="{data.dinero.timbradas} de {data.dinero.facturas} timbradas"
	/>
	<StatCard
		label="Cobrado"
		value={formatoPesos(Number(data.dinero.cobrado))}
		hint="{data.dinero.pagos} pagos recibidos"
	/>
	<StatCard
		label="Por cobrar"
		value={formatoPesos(Number(data.dinero.porCobrar))}
		hint={Number(data.dinero.vencido) > 0
			? `${formatoPesos(Number(data.dinero.vencido))} ya vencido`
			: "Nada vencido"}
	/>
</div>

<!-- Real GET form: the filters ARE the URL, so any view is shareable and works with JS off. -->
<form
	method="GET"
	class="mb-4 grid gap-3 rounded-lg border border-sand-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
>
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
	<Field
		label="Respuesta del cliente"
		name="estado"
	>
		{#snippet children(id)}
			<select
				{id}
				name="estado"
				class={INPUT}
			>
				<option value="">Todas</option>
				{#each data.estados as e (e.value)}
					<option
						value={e.value}
						selected={data.filtros.estado === e.value}>{e.label}</option
					>
				{/each}
			</select>
		{/snippet}
	</Field>
	<Field
		label="Avance del taller"
		name="estadoInterno"
	>
		{#snippet children(id)}
			<select
				{id}
				name="estadoInterno"
				class={INPUT}
			>
				<option value="">Todos</option>
				{#each data.internos as e (e.value)}
					<option
						value={e.value}
						selected={data.filtros.estadoInterno === e.value}>{e.label}</option
					>
				{/each}
			</select>
		{/snippet}
	</Field>

	{#if enFacturas}<input
			type="hidden"
			name="ver"
			value="facturas"
		/>{/if}

	<div class="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
		<Button size="sm">
			<Search
				size={16}
				aria-hidden="true"
			/>
			Filtrar
		</Button>
		<Button
			href={rango(7)}
			variant="ghost"
			size="sm">7 días</Button
		>
		<Button
			href={rango(30)}
			variant="ghost"
			size="sm">30 días</Button
		>
		<Button
			href={esteMes()}
			variant="ghost"
			size="sm">Este mes</Button
		>
		<Button
			href={rango(365)}
			variant="ghost"
			size="sm">1 año</Button
		>
	</div>
</form>

<!-- Two lenses on the same window: what was quoted, and what got billed. -->
<div class="mb-3 flex rounded-md border border-sand-300 p-0.5 sm:w-max">
	<Button
		href={searchHref(page.url, { ver: null, page: null })}
		variant={enFacturas ? "ghost" : "primary"}
		size="sm"
	>
		<ReceiptText
			size={15}
			aria-hidden="true"
		/>
		Cotizaciones ({data.total})
	</Button>
	{#if data.puede.verFacturas}
		<Button
			href={searchHref(page.url, { ver: "facturas", page: null })}
			variant={enFacturas ? "primary" : "ghost"}
			size="sm"
		>
			<FileText
				size={15}
				aria-hidden="true"
			/>
			Facturas ({data.facturasTotal})
		</Button>
	{/if}
</div>

<!--
	Rejected quotes are hidden here by default — they are money that was never going to arrive, and
	they push the live ones off the page. Plain link, so it is shareable and works with JS off like
	every other filter on this screen.
-->
{#if !enFacturas && (data.rechazadas || data.rechazadasOcultas > 0)}
	<p class="mb-3">
		<a
			href={searchHref(page.url, { rechazadas: data.rechazadas ? null : "1", page: null })}
			class="text-sm text-brand-700 underline underline-offset-2 hover:text-brand-800"
		>
			{data.rechazadas ? "Ocultar rechazadas" : `Mostrar rechazadas (${data.rechazadasOcultas})`}
		</a>
	</p>
{/if}

{#if enFacturas}
	{#if data.facturas.length === 0}
		<EmptyState
			title="Sin facturas en este periodo"
			description="Cambia el rango de fechas, o factura una cotización autorizada desde su nota."
		>
			{#snippet icon()}<FileText
					size={40}
					aria-hidden="true"
				/>{/snippet}
		</EmptyState>
	{:else}
		<DataTable
			columns={["Folio", "Cliente", "Estado", "Total", "Saldo", "Vence", ""]}
			items={data.facturas}
		>
			{#snippet row(f)}
				<td class="px-4 py-2.5">
					<a
						class="block font-medium text-brand-700 hover:underline"
						href="/panel/facturas/{f.id}">#{f.folio}</a
					>
					<span class="block text-xs text-sand-500">{dia(f.emitidaAt ?? f.createdAt)}</span>
				</td>
				<td class="px-4 py-2.5">
					<span class="block text-sand-950">{f.clienteNombre ?? "—"}</span>
					{#if f.notaFolio}<span class="block text-xs text-sand-500">Nota #{f.notaFolio}</span>{/if}
				</td>
				<td class="px-4 py-2.5">
					<span class="flex flex-wrap items-center gap-1.5">
						<Badge tone={facturaEstadoTone(f.estado)}>{f.estadoLabel}</Badge>
						<!-- Stamped or not is the fact that decides whether this is a fiscal document at
						     all, so it is a badge and not a column somebody has to go look for. -->
						{#if f.timbrada}
							<Badge tone={f.entorno === "produccion" ? "ok" : "warn"}>
								{f.entorno === "produccion" ? "Timbrada" : "Sandbox"}
							</Badge>
						{:else}
							<Badge tone="neutral">Sin timbrar</Badge>
						{/if}
						{#if f.condicionPago === "credito"}
							<Badge tone="brand">{condicionPagoLabel(f.condicionPago)}</Badge>
						{/if}
					</span>
				</td>
				<td class="px-4 py-2.5 tabular-nums text-sand-900">{formatoPesos(Number(f.total))}</td>
				<td class="px-4 py-2.5 tabular-nums">
					{#if f.liquidada}
						<span class="text-ok">Liquidada</span>
					{:else}
						<span class="text-accent-700">{formatoPesos(Number(f.saldo))}</span>
					{/if}
				</td>
				<td class="px-4 py-2.5">
					<span class="block text-sand-600">{dia(f.vence)}</span>
					{#if f.estado === "emitida" && vencimientoLabel(f.diasParaVencer)}
						<span
							class="block text-xs"
							class:text-danger={vencimientoTone(f.diasParaVencer) === "danger"}
							class:text-accent-700={vencimientoTone(f.diasParaVencer) === "warn"}
							class:text-sand-500={vencimientoTone(f.diasParaVencer) === "neutral"}
						>
							{vencimientoLabel(f.diasParaVencer)}
						</span>
					{/if}
				</td>
				<td class="px-4 py-2.5 text-right">
					<span class="flex flex-wrap justify-end gap-1">
						<!-- Our own printout, always. The CFDI's real PDF and its XML only exist once it
						     has been stamped, and they come from the PAC, not from us. -->
						<Button
							href="/panel/facturas/{f.id}/imprimir"
							variant="ghost"
							size="sm"
						>
							<Printer
								size={14}
								aria-hidden="true"
							/>
							Imprimir
						</Button>
						{#if f.timbrada}
							<Button
								href="/api/facturas/{f.id}/documento?formato=pdf"
								variant="ghost"
								size="sm">PDF</Button
							>
							<Button
								href="/api/facturas/{f.id}/documento?formato=xml"
								variant="ghost"
								size="sm">XML</Button
							>
						{/if}
						<Button
							href="/panel/facturas/{f.id}"
							variant="ghost"
							size="sm"
						>
							{#if !f.timbrada && data.puede.timbrar}
								<Stamp
									size={14}
									aria-hidden="true"
								/>
							{/if}
							Abrir
						</Button>
					</span>
				</td>
			{/snippet}
		</DataTable>
	{/if}
{:else if data.cotizaciones.length === 0}
	<EmptyState
		title="Sin cotizaciones en este periodo"
		description="Cambia el rango de fechas, o crea una desde la nota de servicio de la unidad."
	>
		{#snippet icon()}<ReceiptText
				size={40}
				aria-hidden="true"
			/>{/snippet}
	</EmptyState>
{:else}
	<DataTable
		columns={[
			"Folio",
			"Cliente",
			"Cliente dijo",
			"Taller va",
			"Total",
			...(data.puede.verUtilidad ? ["Utilidad", "Margen"] : []),
			"",
		]}
		items={data.cotizaciones}
	>
		{#snippet row(c)}
			<td class="px-4 py-2.5">
				<span class="block font-medium text-sand-950">#{c.folio}</span>
				<span class="block text-xs text-sand-500">{dia(c.createdAt)}</span>
			</td>
			<td class="px-4 py-2.5">
				<span class="block text-sand-950">{c.clienteNombre ?? "—"}</span>
				{#if c.notaFolio}<span class="block text-xs text-sand-500">Nota #{c.notaFolio}</span>{/if}
			</td>
			<td class="px-4 py-2.5">
				<Badge tone={cotizacionEstadoTone(c.estado)}>{c.estadoLabel}</Badge>
			</td>
			<td class="px-4 py-2.5">
				<Badge tone={cotizacionInternoTone(c.estadoInterno)}>{c.estadoInternoLabel}</Badge>
			</td>
			<td class="px-4 py-2.5 tabular-nums text-sand-900">{formatoPesos(Number(c.total))}</td>
			{#if data.puede.verUtilidad}
				<td class="px-4 py-2.5 tabular-nums text-sand-900">
					{data.utilidades[c.id] ? formatoPesos(Number(data.utilidades[c.id]?.utilidad)) : "—"}
				</td>
				<td class="px-4 py-2.5 tabular-nums {(data.utilidades[c.id]?.margen ?? 0) < 0 ? 'text-danger' : 'text-sand-900'}">
					{data.utilidades[c.id]?.margen != null ? `${data.utilidades[c.id]?.margen}%` : "—"}
				</td>
			{/if}
			<td class="px-4 py-2.5 text-right">
				<span class="flex flex-wrap justify-end gap-1">
					<Button
						href="/panel/cotizaciones/{c.id}/imprimir"
						variant="ghost"
						size="sm"
					>
						<Printer
							size={14}
							aria-hidden="true"
						/>
						Imprimir
					</Button>
					{#if c.notaId}
						<Button
							href="/panel/notas/{c.notaId}"
							variant="ghost"
							size="sm">Abrir</Button
						>
					{/if}
					{#if data.puede.enviarCotizacion && c.estado !== "borrador"}
						<form method="POST" action="?/reenviarCotizacionCorreo">
							<input type="hidden" name="cotizacionId" value={c.id} />
							<Button variant="ghost" size="sm">
								<Mail size={14} aria-hidden="true" />
								Reenviar correo
							</Button>
						</form>
					{/if}
				</span>
			</td>
		{/snippet}
	</DataTable>
{/if}

{#if totalPaginas > 1}
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
		<span class="text-sm text-sand-600">Página {data.page} de {totalPaginas}</span>
		{#if data.page < totalPaginas}
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
