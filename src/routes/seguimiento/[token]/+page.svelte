<!--
	Customer-facing status page. Reached from a WhatsApp link, on a phone, usually one-handed.

	Nothing here names a partner taller: `en_taller` reads "En proceso de reparación" like any
	other progress, the comments are only the ones staff marked visible, and there is no transfer
	history. That rule is enforced upstream in `notaParaCliente` / `seguimientoPorToken` — this
	page cannot leak it by accident because it is never sent.
-->
<script lang="ts">
	import Car from "@lucide/svelte/icons/car";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import MessageSquare from "@lucide/svelte/icons/message-square";
	import Phone from "@lucide/svelte/icons/phone";
	import ReceiptText from "@lucide/svelte/icons/receipt-text";
	import PushToggle from "$lib/components/PushToggle.svelte";
	import { formatoPesos } from "$lib/comercial";
	import { haceCuanto } from "$lib/notificaciones";

	let { data } = $props();

	// Amounts arrive as "1234.50" strings on purpose — Decimal drops trailing zeros over the wire.
	const pesos = (v: string) => formatoPesos(Number(v));

	const fecha = (iso: string) =>
		new Date(iso).toLocaleDateString("es-MX", {
			timeZone: "America/Hermosillo",
			day: "numeric",
			month: "long",
			hour: "2-digit",
			minute: "2-digit",
		});

	const ESTADO_TONO: Record<string, string> = {
		recibida: "bg-sand-200 text-sand-800",
		en_diagnostico: "bg-accent-500/25 text-sand-900",
		en_taller: "bg-accent-500/25 text-sand-900",
		lista: "bg-ok/25 text-sand-900",
		entregada: "bg-sand-200 text-sand-700",
		cancelada: "bg-danger/15 text-danger",
	};
</script>

<svelte:head>
	<title>Tu servicio #{data.nota.folio} — Estación 360</title>
	<meta
		name="robots"
		content="noindex, nofollow"
	/>
</svelte:head>

<div class="min-h-svh bg-sand-100">
	<header class="border-b border-sand-200 bg-sand-50">
		<div class="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
			<span class="font-display text-xl tracking-tight text-sand-950">
				ESTACIÓN <span class="text-brand-600">360</span>
			</span>
		</div>
	</header>

	<main class="mx-auto max-w-2xl space-y-4 px-4 py-6">
		<section class="rounded-lg border border-sand-200 bg-white p-5">
			<p class="text-xs font-medium uppercase tracking-wide text-sand-500">Nota de servicio #{data.nota.folio}</p>
			<h1 class="font-display mt-1 flex items-center gap-2 text-2xl text-sand-950">
				<Car
					size={22}
					aria-hidden="true"
					class="shrink-0 text-brand-600"
				/>
				{data.nota.unidad ?? "Tu unidad"}
			</h1>
			{#if data.nota.placas}
				<p class="mt-0.5 text-sm text-sand-600">Placas {data.nota.placas}</p>
			{/if}

			<p class="mt-4">
				<span
					class="inline-block rounded-full px-3 py-1.5 text-sm font-bold {ESTADO_TONO[data.nota.estado] ??
						'bg-sand-200 text-sand-800'}"
				>
					{data.nota.estadoLabel}
				</span>
			</p>

			<dl class="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
				<div>
					<dt class="text-xs text-sand-500">Recibimos tu unidad</dt>
					<dd class="text-sand-900">{fecha(data.nota.recibidaAt)}</dd>
				</div>
				{#if data.nota.kilometraje !== null}
					<div>
						<dt class="text-xs text-sand-500">Kilometraje de entrada</dt>
						<dd class="text-sand-900">{data.nota.kilometraje.toLocaleString("es-MX")} km</dd>
					</div>
				{/if}
				{#if data.nota.entregadaAt}
					<div>
						<dt class="text-xs text-sand-500">Entregada</dt>
						<dd class="text-sand-900">{fecha(data.nota.entregadaAt)}</dd>
					</div>
				{/if}
			</dl>

			<div class="mt-4 rounded border border-sand-200 bg-sand-50 p-3">
				<p class="text-xs text-sand-500">Lo que nos pediste</p>
				<p class="mt-0.5 text-sm leading-relaxed text-sand-800">{data.nota.motivo}</p>
			</div>
		</section>

		<!-- The subscribe prompt lives next to the status, where the value of it is obvious, and it
		     only ever prompts on a tap. -->
		<section class="rounded-lg border border-brand-200 bg-brand-50 p-4">
			<p class="text-sm font-bold text-sand-950">Avísame cuando haya novedades</p>
			<p class="mb-3 mt-1 text-xs leading-relaxed text-sand-700">
				Te mandamos un aviso a este teléfono cuando tu unidad avance o esté lista. Puedes apagarlo cuando
				quieras.
			</p>
			<PushToggle
				clavePublica={data.clavePublica}
				endpoint={`/api/seguimiento/${data.token}`}
			/>
		</section>

		{#if data.cotizaciones.length > 0 || data.facturas.length > 0}
			<section class="rounded-lg border border-sand-200 bg-white p-5">
				<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
					<ReceiptText
						size={18}
						aria-hidden="true"
					/>
					Cotizaciones y facturas
				</h2>
				<ul class="mt-3 space-y-3 text-sm">
					<!--
						The line items, not just a total. "¿Qué me van a cobrar?" is the whole question,
						and a single number is the answer that makes somebody call to ask.

						Safe by construction: `exigirSinTaller` refuses a description naming a partner
						shop when the quote is written, so nothing is redacted here.
					-->
					{#each data.cotizaciones as c (c.folio)}
						<li class="rounded border border-sand-200 p-3">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium text-sand-900">Cotización #{c.folio}</span>
								<span class="rounded-full bg-sand-100 px-2 py-0.5 text-xs font-medium text-sand-700">
									{c.estadoLabel}
								</span>
								<span class="ml-auto font-bold text-sand-950">{pesos(c.total)}</span>
							</div>

							{#if c.conceptos.length > 0}
								<!-- Scrolls inside its own box; the page never scrolls sideways. -->
								<div class="mt-2 overflow-x-auto">
									<table class="w-full min-w-[20rem] text-xs">
										<thead>
											<tr class="text-left text-sand-500">
												<th class="py-1 font-medium">Concepto</th>
												<th class="py-1 text-right font-medium">Cant.</th>
												<th class="py-1 text-right font-medium">P. unit.</th>
												<th class="py-1 text-right font-medium">Importe</th>
											</tr>
										</thead>
										<tbody>
											{#each c.conceptos as x (x.id)}
												<tr class="border-t border-sand-100">
													<td class="py-1.5 pr-2 text-sand-800">
														{x.descripcion}
														<span class="block text-sand-500">{x.tipoLabel}</span>
													</td>
													<td class="py-1.5 text-right text-sand-600">{Number(x.cantidad)}</td
													>
													<td class="py-1.5 pl-2 text-right text-sand-600"
														>{pesos(x.precioUnitario)}</td
													>
													<td class="py-1.5 pl-2 text-right text-sand-900"
														>{pesos(x.importe)}</td
													>
												</tr>
											{/each}
										</tbody>
										<tfoot class="text-sand-600">
											<tr class="border-t border-sand-200">
												<td
													colspan="3"
													class="py-1 pr-2 text-right">Subtotal</td
												>
												<td class="py-1 pl-2 text-right">{pesos(c.subtotal)}</td>
											</tr>
											<tr>
												<td
													colspan="3"
													class="py-1 pr-2 text-right">IVA</td
												>
												<td class="py-1 pl-2 text-right">{pesos(c.iva)}</td>
											</tr>
											<tr class="font-bold text-sand-950">
												<td
													colspan="3"
													class="py-1 pr-2 text-right">Total</td
												>
												<td class="py-1 pl-2 text-right">{pesos(c.total)}</td>
											</tr>
										</tfoot>
									</table>
								</div>
							{/if}

							{#if c.vigenciaHasta}
								<p class="mt-2 text-xs text-sand-500">
									Precio vigente hasta el {c.vigenciaHasta.slice(0, 10)}
								</p>
							{/if}
						</li>
					{/each}

					{#each data.facturas as f (f.folio)}
						<li class="flex flex-wrap items-center gap-2 rounded border border-sand-200 p-3">
							<span class="font-medium text-sand-900">Factura #{f.folio}</span>
							<span class="rounded-full bg-sand-100 px-2 py-0.5 text-xs font-medium text-sand-700">
								{f.estadoLabel}
							</span>
							<span class="ml-auto font-bold text-sand-950">{pesos(f.total)}</span>
							{#if f.vence}
								<span class="w-full text-xs text-sand-500">Vence {f.vence.slice(0, 10)}</span>
							{/if}
						</li>
					{/each}
				</ul>
				<p class="mt-3 text-xs text-sand-500">
					Para autorizar o aclarar cualquier cargo, háblanos. Nada se cobra sin tu visto bueno.
				</p>
			</section>
		{/if}

		{#if data.comentarios.length > 0}
			<section class="rounded-lg border border-sand-200 bg-white p-5">
				<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
					<MessageSquare
						size={18}
						aria-hidden="true"
					/>
					Mensajes del taller
				</h2>
				<ul class="mt-3 space-y-3">
					{#each data.comentarios as c (c.id)}
						<li class="border-l-2 border-brand-200 pl-3">
							<p class="text-sm leading-relaxed text-sand-800">{c.texto}</p>
							<p class="mt-0.5 text-xs text-sand-500">{haceCuanto(c.createdAt)}</p>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if data.avisos.length > 0}
			<section class="rounded-lg border border-sand-200 bg-white p-5">
				<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
					<CircleCheck
						size={18}
						aria-hidden="true"
					/>
					Avance
				</h2>
				<ol class="mt-3 space-y-3">
					{#each data.avisos as a (a.id)}
						<li class="flex gap-3">
							<span class="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600"></span>
							<span class="min-w-0">
								<span class="block text-sm font-medium text-sand-900">{a.titulo}</span>
								<span class="block text-sm text-sand-600">{a.cuerpo}</span>
								<span class="block text-xs text-sand-500">{haceCuanto(a.createdAt)}</span>
							</span>
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		<section class="rounded-lg border border-sand-200 bg-white p-5 text-sm">
			<p class="flex items-center gap-2 font-bold text-sand-950">
				<Phone
					size={18}
					aria-hidden="true"
				/>
				¿Dudas con tu servicio?
			</p>
			<p class="mt-1 text-sand-600">Háblanos y con gusto te explicamos.</p>
			<p class="mt-3 flex flex-wrap gap-3">
				<a
					href="https://wa.me/526621234567"
					class="inline-flex items-center rounded-md bg-whatsapp px-4 py-2.5 font-bold text-white"
				>
					WhatsApp
				</a>
				<a
					href="tel:+526621234567"
					class="inline-flex items-center rounded-md border-2 border-sand-300 px-4 py-2.5 font-bold text-sand-950"
				>
					662 123 4567
				</a>
			</p>
		</section>
	</main>
</div>
