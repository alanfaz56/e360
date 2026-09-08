<script lang="ts">
	import Phone from "@lucide/svelte/icons/phone";
	import ReceiptText from "@lucide/svelte/icons/receipt-text";
	import { formatoPesos } from "$lib/comercial";
	import { telHref, telefonoFormato, waHref } from "$lib/empresa";

	let { data, form } = $props();
	const c = $derived(data.cotizacion);
	const pesos = (v: string) => formatoPesos(Number(v));
</script>

<svelte:head>
	<title>Cotización #{c.folio} — Estación 360</title>
	<meta
		name="robots"
		content="noindex, nofollow"
	/>
</svelte:head>

<div class="min-h-svh bg-sand-100">
	<main class="mx-auto max-w-2xl space-y-4 px-4 py-6">
		<section class="rounded-lg border border-sand-200 bg-white p-5">
			<p class="text-xs font-medium uppercase tracking-wide text-sand-500">Cotización #{c.folio}</p>
			<h1 class="font-display mt-1 flex items-center gap-2 text-2xl text-sand-950">
				<ReceiptText
					size={22}
					aria-hidden="true"
					class="shrink-0 text-brand-600"
				/>
				{c.clienteNombre}
			</h1>
			{#if c.unidad}<p class="mt-1 text-sm text-sand-600">{c.unidad}</p>{/if}
			<div class="mt-4 flex flex-wrap items-center gap-2">
				<span class="rounded-full bg-sand-100 px-3 py-1 text-sm font-medium text-sand-800">{c.estadoLabel}</span
				>
				<span class="ml-auto text-xl font-bold text-sand-950">{pesos(c.total)}</span>
			</div>
		</section>

		<section class="rounded-lg border border-sand-200 bg-white p-5">
			<h2 class="font-display text-lg text-sand-950">Conceptos</h2>
			<div class="mt-3 overflow-x-auto">
				<table class="w-full min-w-[24rem] text-sm">
					<thead
						><tr class="text-left text-sand-500"
							><th class="py-2 font-medium">Concepto</th><th class="py-2 text-right font-medium">Cant.</th
							><th class="py-2 text-right font-medium">P. unit.</th><th
								class="py-2 text-right font-medium">Importe</th
							></tr
						></thead
					>
					<tbody>
						{#each c.conceptos as x (x.id)}
							<tr class="border-t border-sand-100"
								><td class="py-2 pr-2 text-sand-800"
									>{x.descripcion}<span class="block text-xs text-sand-500">{x.tipoLabel}</span></td
								><td class="py-2 text-right text-sand-600">{Number(x.cantidad)}</td><td
									class="py-2 pl-2 text-right text-sand-600">{pesos(x.precioUnitario)}</td
								><td class="py-2 pl-2 text-right text-sand-900">{pesos(x.importe)}</td></tr
							>
						{/each}
					</tbody>
					<tfoot class="text-sand-600"
						><tr class="border-t border-sand-200"
							><td
								colspan="3"
								class="py-1 pr-2 text-right">Subtotal</td
							><td class="py-1 text-right">{pesos(c.subtotal)}</td></tr
						><tr
							><td
								colspan="3"
								class="py-1 pr-2 text-right">IVA</td
							><td class="py-1 text-right">{pesos(c.iva)}</td></tr
						><tr class="font-bold text-sand-950"
							><td
								colspan="3"
								class="py-1 pr-2 text-right">Total</td
							><td class="py-1 text-right">{pesos(c.total)}</td></tr
						></tfoot
					>
				</table>
			</div>
			{#if c.vigenciaHasta}<p class="mt-3 text-xs text-sand-500">
					Precio vigente hasta el {c.vigenciaHasta.slice(0, 10)}.
				</p>{/if}
			{#if c.notas}<p class="mt-3 whitespace-pre-line text-sm text-sand-700">{c.notas}</p>{/if}

			{#if form?.message}<p
					class="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
					role="alert"
				>
					{form.message}
				</p>{/if}
			{#if c.estado === "enviada"}
				{#if c.autorizacionSolicitadaAt}
					<div class="mt-4 rounded border border-ok/40 bg-ok/10 p-3">
						<p class="font-medium text-sand-900">Solicitaste autorizar esta cotización.</p>
						<p class="mt-1 text-xs text-sand-600">
							Un asesor confirmará contigo quién dio el visto bueno. El trabajo aún no inicia automáticamente.
						</p>
						<form method="POST" action="?/cancelarAutorizacion" class="mt-2">
							<button
								type="submit"
								class="text-xs text-sand-700 underline underline-offset-2 hover:text-sand-950"
								>Cambié de opinión</button
							>
						</form>
					</div>
				{:else if c.rechazoSolicitadoAt}
					<div class="mt-4 rounded border border-accent-500/40 bg-accent-500/10 p-3">
						<p class="font-medium text-sand-900">Pediste rechazar esta cotización.</p>
						{#if c.rechazoSolicitadoMotivo}<p class="mt-1 text-xs text-sand-600">
								Tu motivo: {c.rechazoSolicitadoMotivo}
							</p>{/if}
						<p class="mt-1 text-xs text-sand-600">
							El taller lo confirmará contigo; nada se cancela automáticamente.
						</p>
						<form
							method="POST"
							action="?/cancelarRechazo"
							class="mt-2"
						>
							<button
								type="submit"
								class="text-xs text-sand-700 underline underline-offset-2 hover:text-sand-950"
								>Cambié de opinión</button
							>
						</form>
					</div>
				{:else}
					<form method="POST" action="?/solicitarAutorizacion" class="mt-4 rounded border border-ok/40 bg-ok/10 p-3">
						<p class="font-medium text-sand-900">¿Estás de acuerdo con esta cotización?</p>
						<p class="mt-1 text-xs text-sand-600">
							Tu solicitud queda pendiente hasta que un asesor confirme tu autorización.
						</p>
						<button
							type="submit"
							class="mt-3 rounded-md bg-ok px-4 py-2.5 text-sm font-bold text-sand-950 hover:brightness-95"
							>Solicitar autorización</button
						>
					</form>
					<details class="group mt-4">
						<summary
							class="cursor-pointer list-none text-sm text-sand-600 underline underline-offset-2 hover:text-sand-900"
							>No quiero esta cotización</summary
						>
						<form
							method="POST"
							action="?/solicitarRechazo"
							class="mt-2 rounded border border-sand-200 bg-sand-50 p-3"
						>
							<label
								class="block text-xs text-sand-700"
								for="motivo">¿Nos cuentas por qué? (opcional)</label
							><textarea
								id="motivo"
								name="motivo"
								rows="2"
								maxlength="500"
								class="mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
							></textarea><button
								type="submit"
								class="mt-2 rounded-md bg-sand-900 px-3 py-2 text-sm font-medium text-white hover:bg-sand-950"
								>Solicitar rechazo</button
							>
							<p class="mt-2 text-xs text-sand-500">
								Nos avisas y lo confirmamos contigo. Nada se cancela solo.
							</p>
						</form>
					</details>
				{/if}
			{/if}
			<p class="mt-4 text-xs text-sand-500">
				Puedes solicitar la autorización aquí; un asesor la confirma antes de iniciar. Para aclarar cualquier
				concepto, háblanos. Nada se cobra sin tu visto bueno.
			</p>
		</section>

		<section class="rounded-lg border border-sand-200 bg-white p-5 text-sm">
			<p class="flex items-center gap-2 font-bold text-sand-950">
				<Phone
					size={18}
					aria-hidden="true"
				/>¿Dudas con tu cotización?
			</p>
			<p class="mt-1 text-sand-600">Háblanos y con gusto te explicamos.</p>
			<p class="mt-3 flex flex-wrap gap-3">
				{#if waHref(data.empresa.telefono)}<a
						href={waHref(data.empresa.telefono)}
						class="inline-flex items-center rounded-md bg-whatsapp px-4 py-2.5 font-bold text-white"
						>WhatsApp</a
					>{/if}
				{#if telHref(data.empresa.telefono)}<a
						href={telHref(data.empresa.telefono)}
						class="inline-flex items-center rounded-md border-2 border-sand-300 px-4 py-2.5 font-bold text-sand-950"
						>{telefonoFormato(data.empresa.telefono)}</a
					>{/if}
			</p>
		</section>
	</main>
</div>
