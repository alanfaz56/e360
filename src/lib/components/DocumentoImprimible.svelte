<!--
	A quote or an invoice, laid out to be printed.

	**No PDF library.** The browser's own print dialog produces a PDF on every platform the shop
	uses, including a phone, and it does it without a dependency, without a headless browser on the
	server and without a serverless function that runs out of memory rendering one. A print
	stylesheet IS the PDF generator here — that is the whole trick.

	`@media print` strips the panel chrome and the button, so what comes out is the document and
	nothing else. On screen it stays readable, because the same page is what somebody checks before
	they print it.

	This is NOT the CFDI. A stamped invoice's legal document comes from the PAC as a real PDF and
	its XML — see `/api/facturas/[id]/documento`. This is the shop's own printout: what the
	customer signs, what goes in the folder, what a quote is sent as.
-->
<script lang="ts">
	import Printer from "@lucide/svelte/icons/printer";
	import Button from "./Button.svelte";
	import { formatoPesos } from "$lib/comercial";
	import { fechaLarga } from "$lib/agenda";

	type Concepto = {
		id: string;
		tipoLabel: string;
		descripcion: string;
		cantidad: string;
		precioUnitario: string;
		importe: string;
	};

	let {
		titulo,
		folio,
		fecha,
		estadoLabel,
		cliente,
		unidad = null,
		notaFolio = null,
		conceptos,
		subtotal,
		iva,
		total,
		notas = null,
		uuid = null,
		condicion = null,
		vence = null,
		leyenda = null,
	}: {
		titulo: string;
		folio: number;
		fecha: string;
		estadoLabel: string;
		cliente: { nombre: string; rfc: string | null; direccion: string | null; telefono: string | null };
		unidad?: string | null;
		notaFolio?: number | null;
		conceptos: Concepto[];
		subtotal: string;
		iva: string;
		total: string;
		notas?: string | null;
		uuid?: string | null;
		condicion?: string | null;
		vence?: string | null;
		leyenda?: string | null;
	} = $props();

	const dia = (iso: string) => fechaLarga(iso.slice(0, 10));
</script>

<div class="mx-auto max-w-3xl">
	<!-- Screen only: the button must not print itself onto the document. -->
	<div class="no-imprimir mb-4 flex flex-wrap items-center gap-2">
		<Button onclick={() => window.print()}>
			<Printer
				size={18}
				aria-hidden="true"
			/>
			Imprimir o guardar como PDF
		</Button>
		<span class="text-xs text-sand-500">
			En el diálogo de impresión elige «Guardar como PDF» — así sale el archivo, sin instalar nada.
		</span>
	</div>

	<article class="documento rounded-lg border border-sand-200 bg-white p-8 text-sand-900">
		<header class="flex flex-wrap items-start justify-between gap-4 border-b border-sand-300 pb-4">
			<div>
				<p class="font-display text-2xl text-sand-950">Estación 360</p>
				<p class="text-sm text-sand-600">Taller mecánico · Hermosillo, Sonora</p>
			</div>
			<div class="text-right">
				<p class="font-display text-xl text-sand-950">{titulo}</p>
				<p class="text-sm text-sand-700">Folio #{folio}</p>
				<p class="text-xs text-sand-500">{dia(fecha)}</p>
				<p class="text-xs text-sand-500">{estadoLabel}</p>
			</div>
		</header>

		<section class="mt-5 grid gap-4 sm:grid-cols-2">
			<div>
				<h2 class="text-xs font-medium uppercase tracking-wide text-sand-500">Cliente</h2>
				<p class="mt-1 font-medium text-sand-950">{cliente.nombre}</p>
				{#if cliente.rfc}<p class="text-sm text-sand-700">RFC: {cliente.rfc}</p>{/if}
				{#if cliente.direccion}<p class="text-sm text-sand-700">{cliente.direccion}</p>{/if}
				{#if cliente.telefono}<p class="text-sm text-sand-700">Tel. {cliente.telefono}</p>{/if}
			</div>
			<div>
				{#if unidad}
					<h2 class="text-xs font-medium uppercase tracking-wide text-sand-500">Unidad</h2>
					<p class="mt-1 text-sand-900">{unidad}</p>
				{/if}
				{#if notaFolio}
					<p class="mt-1 text-sm text-sand-600">Nota de servicio #{notaFolio}</p>
				{/if}
				{#if condicion}
					<p class="mt-1 text-sm text-sand-600">
						{condicion}{vence ? ` · vence ${dia(vence)}` : ""}
					</p>
				{/if}
				{#if uuid}
					<!-- The folio fiscal, so the printout can be matched against the stamped CFDI. -->
					<p class="mt-1 text-xs text-sand-500">
						UUID <span class="font-mono">{uuid}</span>
					</p>
				{/if}
			</div>
		</section>

		<table class="mt-6 w-full border-collapse text-sm">
			<thead>
				<tr class="border-b border-sand-300 text-left text-xs uppercase tracking-wide text-sand-500">
					<th class="py-2 pr-2 font-medium">Concepto</th>
					<th class="py-2 px-2 text-right font-medium">Cant.</th>
					<th class="py-2 px-2 text-right font-medium">P. unitario</th>
					<th class="py-2 pl-2 text-right font-medium">Importe</th>
				</tr>
			</thead>
			<tbody>
				{#each conceptos as c (c.id)}
					<tr class="border-b border-sand-100 align-top">
						<td class="py-2 pr-2">
							<span class="block text-sand-900">{c.descripcion}</span>
							<span class="block text-xs text-sand-500">{c.tipoLabel}</span>
						</td>
						<td class="py-2 px-2 text-right tabular-nums">{c.cantidad}</td>
						<td class="py-2 px-2 text-right tabular-nums">{formatoPesos(Number(c.precioUnitario))}</td>
						<td class="py-2 pl-2 text-right tabular-nums">{formatoPesos(Number(c.importe))}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<div class="mt-4 flex justify-end">
			<dl class="w-full max-w-xs space-y-1 text-sm">
				<div class="flex justify-between">
					<dt class="text-sand-600">Subtotal</dt>
					<dd class="tabular-nums text-sand-900">{formatoPesos(Number(subtotal))}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-sand-600">IVA 16 %</dt>
					<dd class="tabular-nums text-sand-900">{formatoPesos(Number(iva))}</dd>
				</div>
				<div class="flex justify-between border-t border-sand-300 pt-1 text-base font-medium">
					<dt class="text-sand-950">Total</dt>
					<dd class="tabular-nums text-sand-950">{formatoPesos(Number(total))}</dd>
				</div>
			</dl>
		</div>

		{#if notas}
			<section class="mt-6 border-t border-sand-200 pt-3">
				<h2 class="text-xs font-medium uppercase tracking-wide text-sand-500">Notas</h2>
				<p class="mt-1 whitespace-pre-wrap text-sm text-sand-700">{notas}</p>
			</section>
		{/if}

		{#if leyenda}
			<p class="mt-6 border-t border-sand-200 pt-3 text-xs text-sand-500">{leyenda}</p>
		{/if}
	</article>
</div>

<style>
	@media print {
		/* The panel chrome belongs to the app, not to the document. */
		:global(body) {
			background: white;
		}
		:global(aside),
		:global(nav),
		:global(header.panel),
		.no-imprimir {
			display: none !important;
		}
		:global(main) {
			padding: 0 !important;
			margin: 0 !important;
			max-width: none !important;
		}
		.documento {
			border: 0;
			padding: 0;
		}
		/* A line item split across two pages is a line item somebody misreads. */
		tr {
			break-inside: avoid;
		}
	}
</style>
