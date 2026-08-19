<script lang="ts">
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import Stamp from "@lucide/svelte/icons/stamp";
	import FileText from "@lucide/svelte/icons/file-text";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { condicionPagoLabel, facturaEstadoTone, formatoPesos, vencimientoLabel, vencimientoTone } from "$lib/comercial";

	let { data, form } = $props();
	const f = $derived(data.factura);
</script>

<svelte:head><title>Factura #{f.folio} — Estación 360</title></svelte:head>

<a
	href={f.notaId ? `/panel/notas/${f.notaId}` : "/panel/cotizaciones"}
	class="mb-4 inline-flex items-center gap-1.5 text-sm text-sand-600 hover:text-brand-700"
>
	<ArrowLeft
		size={16}
		aria-hidden="true"
	/>
	{f.notaId ? `Nota #${f.notaFolio}` : "Facturación"}
</a>

<PageHeader
	title="Factura #{f.folio}"
	description={f.clienteNombre ?? "Sin cliente"}
>
	{#snippet actions()}
		<!-- One click, no drawer: everything the CFDI needs is already on the invoice. A second
		     click answers 409 with the UUID it already has instead of spending another timbre. -->
		{#if data.puede.timbrar && !f.timbrada && f.estado !== "cancelada"}
			<form
				method="POST"
				action="?/timbrar"
			>
				<Button size="sm">
					<Stamp
						size={16}
						aria-hidden="true"
					/>
					Timbrar
				</Button>
			</form>
		{/if}
		{#if f.timbrada}
			<Button
				href="/api/facturas/{f.id}/documento?formato=pdf"
				size="sm"
				variant="outline"
			>
				<FileText
					size={16}
					aria-hidden="true"
				/>
				PDF
			</Button>
			<Button
				href="/api/facturas/{f.id}/documento?formato=xml"
				size="sm"
				variant="ghost"
			>
				XML
			</Button>
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
	<div class="flex flex-wrap items-center gap-2">
		<Badge tone={facturaEstadoTone(f.estado)}>{f.estadoLabel}</Badge>
		<Badge tone={f.condicionPago === "credito" ? "warn" : "neutral"}>
			{condicionPagoLabel(f.condicionPago)}
		</Badge>
		<span class="ml-auto font-display text-xl text-sand-950">{formatoPesos(Number(f.total))}</span>
	</div>

	{#if f.estado !== "cancelada"}
		<p class="mt-1 text-sm text-sand-500">
			Pagado {formatoPesos(Number(f.pagado))}
			{#if !f.liquidada}
				· <strong class="text-accent-700">saldo {formatoPesos(Number(f.saldo))}</strong>
			{/if}
			{#if f.vence}· vence {f.vence.slice(0, 10)}{/if}
			{#if f.estado === "emitida" && vencimientoLabel(f.diasParaVencer)}
				·
				<strong
					class:text-danger={vencimientoTone(f.diasParaVencer) === "danger"}
					class:text-accent-700={vencimientoTone(f.diasParaVencer) === "warn"}
				>
					{vencimientoLabel(f.diasParaVencer)}
				</strong>
			{/if}
		</p>
	{:else if f.canceladoMotivo}
		<p class="mt-1 text-sm text-danger">Cancelada: {f.canceladoMotivo}</p>
	{/if}

	<!-- The folio fiscal, once it exists. `timbrada` and `emitida` are different facts: the shop
	     issues, the SAT stamps, and there is a window where only the first happened. -->
	{#if f.timbrada}
		<p class="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-sand-600">
			<Badge tone={f.entorno === "produccion" ? "ok" : "warn"}>
				{f.entorno === "produccion" ? "Timbrada" : "Sandbox (sin validez fiscal)"}
			</Badge>
			<span class="font-mono text-xs">{f.uuid}</span>
		</p>
		{#if f.cancelacionEstatus === "en_proceso"}
			<p class="mt-1 text-xs text-accent-700">
				Cancelación en proceso: el SAT espera que el cliente la acepte. Hasta entonces la factura
				sigue vigente.
			</p>
		{/if}
	{/if}

	<dl class="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
		<div>
			<dt class="text-sand-500">Cliente</dt>
			<dd>
				<a
					class="text-brand-700 hover:underline"
					href="/panel/clientes/{f.clienteId}">{f.clienteNombre ?? "—"}</a
				>
			</dd>
		</div>
		<div>
			<dt class="text-sand-500">RFC</dt>
			<dd class="font-mono text-sand-950">{f.clienteRfc ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Emitida</dt>
			<dd class="text-sand-950">{f.emitidaAt ? f.emitidaAt.slice(0, 10) : "—"}</dd>
		</div>
	</dl>
</section>

<h2 class="font-display mt-8 text-lg text-sand-950">Conceptos</h2>
<div class="mt-3 overflow-x-auto rounded-lg border border-sand-200 bg-white">
	<table class="w-full text-sm">
		<thead class="border-b border-sand-200 text-left text-xs text-sand-500">
			<tr>
				<th class="px-4 py-2 font-medium">Descripción</th>
				<th class="px-4 py-2 font-medium">Cantidad</th>
				<th class="px-4 py-2 font-medium">Precio</th>
				<th class="px-4 py-2 text-right font-medium">Importe</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-sand-100">
			{#each f.conceptos as c (c.id)}
				<tr>
					<td class="px-4 py-2.5">{c.descripcion}</td>
					<td class="px-4 py-2.5 text-sand-600">{c.cantidad}</td>
					<td class="px-4 py-2.5 text-sand-600">{formatoPesos(Number(c.precioUnitario))}</td>
					<td class="px-4 py-2.5 text-right text-sand-900">{formatoPesos(Number(c.importe))}</td>
				</tr>
			{/each}
		</tbody>
		<tfoot class="border-t border-sand-200 text-sm">
			<tr>
				<td
					colspan="3"
					class="px-4 py-2 text-right text-sand-500">Subtotal</td
				>
				<td class="px-4 py-2 text-right">{formatoPesos(Number(f.subtotal))}</td>
			</tr>
			<tr>
				<td
					colspan="3"
					class="px-4 py-2 text-right text-sand-500">IVA</td
				>
				<td class="px-4 py-2 text-right">{formatoPesos(Number(f.iva))}</td>
			</tr>
			<tr class="font-medium text-sand-950">
				<td
					colspan="3"
					class="px-4 py-2 text-right">Total</td
				>
				<td class="px-4 py-2 text-right">{formatoPesos(Number(f.total))}</td>
			</tr>
		</tfoot>
	</table>
</div>

{#if f.pagos.length > 0}
	<h2 class="font-display mt-8 text-lg text-sand-950">Pagos</h2>
	<ul class="mt-3 space-y-1.5 text-sm">
		{#each f.pagos as p (p.id)}
			<li class="flex flex-wrap items-center gap-2 rounded border border-sand-200 bg-white px-3 py-2">
				<span>{p.pagadoAt.slice(0, 10)} · {p.metodoLabel}</span>
				{#if p.referencia}<span class="text-sand-500">ref. {p.referencia}</span>{/if}
				<span class="ml-auto font-medium text-sand-900">{formatoPesos(Number(p.monto))}</span>
			</li>
		{/each}
	</ul>
{/if}
