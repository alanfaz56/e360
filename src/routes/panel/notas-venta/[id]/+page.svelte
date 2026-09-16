<script lang="ts">
	import { enhance } from "$app/forms";
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import Banknote from "@lucide/svelte/icons/banknote";
	import FileText from "@lucide/svelte/icons/file-text";
	import Ban from "@lucide/svelte/icons/ban";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import Field from "$lib/components/Field.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import {
		CONDICION_PAGO_KEYS,
		CONDICIONES_PAGO,
		METODO_PAGO_KEYS,
		METODOS_PAGO,
		formatoPesos,
		notaVentaEstadoTone,
	} from "$lib/comercial";
	import { page } from "$app/state";
	import { searchHref } from "$lib/url";
	import { sinSaltoAlRedirigir } from "$lib/sin-salto";

	let { data, form } = $props();
	const nv = $derived(data.notaVenta);
	const drawer = $derived(page.url.searchParams.get("drawer"));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null }));
	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";
</script>

<svelte:head><title>Nota de venta #{nv.folio} — Estación 360</title></svelte:head>

<a
	href={nv.notaId ? `/panel/notas/${nv.notaId}` : "/panel/cotizaciones"}
	class="mb-4 inline-flex items-center gap-1.5 text-sm text-sand-600 hover:text-brand-700"
>
	<ArrowLeft
		size={16}
		aria-hidden="true"
	/>
	{nv.notaId ? `Nota #${nv.notaFolio}` : "Cotizaciones"}
</a>

<PageHeader
	title="Nota de venta #{nv.folio}"
	description={nv.clienteNombre ?? "Sin cliente"}
>
	{#snippet actions()}
		{#if nv.estado === "activa"}
			{#if data.puede.cobrar && !nv.liquidada}
				<Button
					href={searchHref(page.url, { drawer: "pagar" })}
					size="sm"
				>
					<Banknote
						size={16}
						aria-hidden="true"
					/>
					Registrar pago
				</Button>
			{/if}
			{#if data.puede.facturar}
				<Button
					href={searchHref(page.url, { drawer: "facturar" })}
					size="sm"
					variant="outline"
				>
					<FileText
						size={16}
						aria-hidden="true"
					/>
					Convertir en factura
				</Button>
			{/if}
			{#if data.puede.cancelar && nv.pagos.length === 0}
				<Button
					href={searchHref(page.url, { drawer: "cancelar" })}
					size="sm"
					variant="ghost"
				>
					<Ban
						size={16}
						aria-hidden="true"
					/>
					Cancelar
				</Button>
			{/if}
		{/if}
	{/snippet}
</PageHeader>

<Flash {form} />

<section class="mt-6 rounded-lg border border-sand-200 bg-white p-5">
	<div class="flex flex-wrap items-center gap-2">
		<Badge tone={notaVentaEstadoTone(nv.estado)}>{nv.estadoLabel}</Badge>
		<Badge tone="neutral">Sin IVA</Badge>
		<span class="ml-auto font-display text-xl text-sand-950">{formatoPesos(Number(nv.total))}</span>
	</div>

	{#if nv.estado === "activa"}
		<p class="mt-1 text-sm text-sand-500">
			Pagado {formatoPesos(Number(nv.pagado))}
			{#if !nv.liquidada}
				· <strong class="text-accent-700">saldo {formatoPesos(Number(nv.saldo))}</strong>
			{/if}
		</p>
	{:else if nv.estado === "cancelada" && nv.canceladoMotivo}
		<p class="mt-1 text-sm text-danger">Cancelada: {nv.canceladoMotivo}</p>
	{:else if nv.estado === "facturada"}
		<p class="mt-1 text-sm text-sand-500">
			Convertida en <a
				class="text-brand-700 hover:underline"
				href="/panel/facturas/{nv.facturaId}">factura</a
			>.
		</p>
	{/if}

	<dl class="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
		<div>
			<dt class="text-sand-500">Cliente</dt>
			<dd class="text-sand-950">{nv.clienteNombre ?? "—"}</dd>
		</div>
		{#if nv.cotizacionId}
			<div>
				<dt class="text-sand-500">Cotización</dt>
				<dd>
					<a
						class="text-brand-700 hover:underline"
						href="/panel/cotizaciones/{nv.cotizacionId}">#{nv.cotizacionFolio}</a
					>
				</dd>
			</div>
		{/if}
		<div>
			<dt class="text-sand-500">Creada</dt>
			<dd class="text-sand-950">{nv.createdAt.slice(0, 10)}</dd>
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
			{#each nv.conceptos as c (c.id)}
				<tr>
					<td class="px-4 py-2.5">{c.descripcion}</td>
					<td class="px-4 py-2.5 text-sand-600">{c.cantidad}</td>
					<td class="px-4 py-2.5 text-sand-600">{formatoPesos(Number(c.precioUnitario))}</td>
					<td class="px-4 py-2.5 text-right text-sand-900">{formatoPesos(Number(c.importe))}</td>
				</tr>
			{/each}
		</tbody>
		<tfoot class="border-t border-sand-200 text-sm font-medium text-sand-950">
			<tr>
				<td
					colspan="3"
					class="px-4 py-2 text-right">Total</td
				>
				<td class="px-4 py-2 text-right">{formatoPesos(Number(nv.total))}</td>
			</tr>
		</tfoot>
	</table>
</div>

{#if nv.pagos.length > 0}
	<h2 class="font-display mt-8 text-lg text-sand-950">Pagos</h2>
	<ul class="mt-3 space-y-1.5 text-sm">
		{#each nv.pagos as p (p.id)}
			<li class="flex flex-wrap items-center gap-2 rounded border border-sand-200 bg-white px-3 py-2">
				<span>{p.pagadoAt.slice(0, 10)} · {p.metodoLabel}</span>
				{#if p.referencia}<span class="text-sand-500">ref. {p.referencia}</span>{/if}
				<span class="ml-auto font-medium text-sand-900">{formatoPesos(Number(p.monto))}</span>
			</li>
		{/each}
	</ul>
{/if}

{#if drawer === "pagar" && data.puede.cobrar && nv.estado === "activa"}
	<Drawer
		title="Registrar pago"
		description="Nota de venta #{nv.folio} · saldo {formatoPesos(Number(nv.saldo))}"
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			use:enhance={sinSaltoAlRedirigir()}
			action="?/pagar"
			class="space-y-4"
		>
			<Field
				label="Monto"
				name="monto"
				required
				value={nv.saldo}
				hint="Máximo {formatoPesos(Number(nv.saldo))}. Pagos parciales sí se aceptan."
			/>
			<Field
				label="Método"
				name="metodo"
			>
				{#snippet children(id)}
					<select
						{id}
						name="metodo"
						class={INPUT}
						required
					>
						{#each METODO_PAGO_KEYS as k (k)}
							<option value={k}>{METODOS_PAGO[k].label}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			<Field
				label="Referencia"
				name="referencia"
			/>
			<Field
				label="Fecha del pago"
				name="pagadoAt"
				type="date"
				value={data.hoy}
			/>
			<Field
				label="Notas"
				name="notas"
			/>
			<Button full>Registrar pago</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "cancelar" && data.puede.cancelar && nv.estado === "activa"}
	<Drawer
		title="Cancelar nota de venta"
		description="Nota de venta #{nv.folio} · {formatoPesos(Number(nv.total))}"
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			use:enhance={sinSaltoAlRedirigir()}
			action="?/cancelar"
			class="space-y-4"
		>
			<Field
				label="Motivo"
				name="motivo"
				required
				hint="Máximo 255 caracteres. Una nota de venta con pagos ya no se cancela."
			/>
			<Button full>Cancelar la nota de venta</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "facturar" && data.puede.facturar && nv.estado === "activa"}
	<Drawer
		title="Convertir en factura"
		description="Nota de venta #{nv.folio} · {formatoPesos(Number(nv.total))} + IVA"
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			use:enhance={sinSaltoAlRedirigir()}
			action="?/facturar"
			class="space-y-4"
		>
			<p class="rounded border border-sand-200 bg-sand-50 px-3 py-2 text-xs text-sand-600">
				Se calcula el IVA sobre {formatoPesos(Number(nv.total))}.
				{#if Number(nv.pagado) > 0}
					Lo ya pagado (<strong>{formatoPesos(Number(nv.pagado))}</strong>) se pasa tal cual a la
					factura — no se vuelve a cobrar, solo queda pendiente el IVA.
				{/if}
			</p>
			<Field
				label="Condición de pago"
				name="condicionPago"
			>
				{#snippet children(id)}
					<select
						{id}
						name="condicionPago"
						class={INPUT}
					>
						{#each CONDICION_PAGO_KEYS as k (k)}
							<option value={k}>{CONDICIONES_PAGO[k].label}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			{#if data.puede.credito}
				<Field
					label="Motivo si excede el crédito"
					name="motivoCredito"
					hint="Solo se usa al forzar una venta a crédito por encima del límite."
				/>
				<label class="flex cursor-pointer items-center gap-2 text-sm text-sand-700">
					<input
						type="checkbox"
						name="forzarCredito"
						value="1"
						class="size-4 accent-brand-600"
					/>
					Autorizar por encima del límite
				</label>
			{/if}
			<Field
				label="Serie"
				name="serie"
				hint="Opcional."
			/>
			<Field
				label="Notas"
				name="notas"
			/>
			<Button full>Convertir en factura</Button>
		</form>
	</Drawer>
{/if}
