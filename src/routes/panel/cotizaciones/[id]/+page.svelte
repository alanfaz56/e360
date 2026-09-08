<script lang="ts">
	import { untrack } from "svelte";
	import CalendarPlus from "@lucide/svelte/icons/calendar-plus";
	import Copy from "@lucide/svelte/icons/copy";
	import Mail from "@lucide/svelte/icons/mail";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Printer from "@lucide/svelte/icons/printer";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import ConceptosForm, { type ConceptoFila } from "$lib/components/ConceptosForm.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import Field from "$lib/components/Field.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import {
		CONCEPTO_TIPO_KEYS,
		CONCEPTO_TIPOS,
		centavos,
		cotizacionEstadoTone,
		cotizacionInternoTone,
		formatoPesos,
		totales,
	} from "$lib/comercial";
	import { page } from "$app/state";
	import { searchHref } from "$lib/url";

	let { data, form } = $props();
	const c = $derived(data.cotizacion);
	const drawer = $derived(page.url.searchParams.get("drawer"));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null }));
	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	let filas = $state<ConceptoFila[]>(
		untrack(() =>
			data.cotizacion.conceptos.map((x) => ({
				productoId: x.productoId ?? "",
				tipo: x.tipo,
				descripcion: x.descripcion,
				cantidad: String(Number(x.cantidad)),
				monto: x.precioUnitario,
			})),
		),
	);
	const tiposConcepto = CONCEPTO_TIPO_KEYS.map((t) => ({ value: t, label: CONCEPTO_TIPOS[t].label }));
	const formatoOpcionProducto = (p: Record<string, unknown>) =>
		`${p.nombre} · ${formatoPesos(Number(p.precioVenta))}`;
	function alElegirProducto(i: number, p: Record<string, unknown> | undefined) {
		if (!p) return;
		filas[i].tipo = p.tipo as string;
		if (!filas[i].descripcion) filas[i].descripcion = p.nombre as string;
		if (!filas[i].monto) filas[i].monto = p.precioVenta as string;
	}
	const previa = $derived(
		totales(
			filas
				.map((f) => ({ cantidad: Number(f.cantidad), precioUnitario: centavos(f.monto) ?? 0n }))
				.filter((f) => Number.isFinite(f.cantidad) && f.cantidad > 0),
		),
	);
	const liga = $derived(c.seguimientoToken ? `${page.url.origin}/cotizacion/${c.seguimientoToken}` : "");
	let copiada = $state(false);
	async function copiarLiga() {
		await navigator.clipboard.writeText(liga);
		copiada = true;
	}
</script>

<svelte:head><title>Cotización #{c.folio} — Estación 360</title></svelte:head>

<PageHeader
	title="Cotización #{c.folio}"
	description={c.notaFolio ? `Nota #${c.notaFolio}` : "Cotización previa a la agenda"}
>
	{#snippet actions()}
		<Button
			href="/panel/cotizaciones/{c.id}/imprimir"
			variant="outline"
			><Printer
				size={17}
				aria-hidden="true"
			/>Imprimir</Button
		>
		{#if data.puede.editar && c.estado === "borrador"}<Button
				href={searchHref(page.url, { drawer: "editar" })}
				variant="outline"
				><Pencil
					size={17}
					aria-hidden="true"
				/>Editar</Button
			>{/if}
	{/snippet}
</PageHeader>

<Flash {form} />

<div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
	<section class="rounded-lg border border-sand-200 bg-white p-5">
		<div class="flex flex-wrap items-center gap-2">
			<Badge tone={cotizacionEstadoTone(c.estado)}>{c.estadoLabel}</Badge><Badge
				tone={cotizacionInternoTone(c.estadoInterno)}>{c.estadoInternoLabel}</Badge
			><span class="ml-auto text-xl font-bold">{formatoPesos(Number(c.total))}</span>
		</div>
		<div class="mt-4 overflow-x-auto">
			<table class="w-full min-w-[30rem] text-sm">
				<thead
					><tr class="text-left text-sand-500"
						><th class="py-2">Concepto</th><th class="py-2 text-right">Cantidad</th><th
							class="py-2 text-right">Precio</th
						><th class="py-2 text-right">Importe</th></tr
					></thead
				><tbody
					>{#each c.conceptos as x (x.id)}<tr class="border-t border-sand-100"
							><td class="py-2 pr-3"
								>{x.descripcion}<span class="block text-xs text-sand-500">{x.tipoLabel}</span></td
							><td class="py-2 text-right">{Number(x.cantidad)}</td><td class="py-2 text-right"
								>{formatoPesos(Number(x.precioUnitario))}</td
							><td class="py-2 text-right">{formatoPesos(Number(x.importe))}</td></tr
						>{/each}</tbody
				><tfoot
					><tr class="border-t border-sand-200"
						><td
							colspan="3"
							class="py-1 text-right text-sand-600">Subtotal</td
						><td class="text-right">{formatoPesos(Number(c.subtotal))}</td></tr
					><tr
						><td
							colspan="3"
							class="py-1 text-right text-sand-600">IVA</td
						><td class="text-right">{formatoPesos(Number(c.iva))}</td></tr
					></tfoot
				>
			</table>
		</div>
		{#if c.notas}<p class="mt-4 whitespace-pre-line rounded bg-sand-50 p-3 text-sm text-sand-700">{c.notas}</p>{/if}
	</section>

	<aside class="space-y-4">
		<section class="rounded-lg border border-sand-200 bg-white p-4 text-sm">
			<h2 class="font-medium text-sand-950">Destino</h2>
			<p class="mt-2">
				<a
					class="text-brand-700 hover:underline"
					href="/panel/clientes/{c.clienteId}">{c.clienteNombre}</a
				>
			</p>
			<p class="text-sand-600">{c.unidad ?? "Sin unidad asignada"}</p>
			{#if c.citaId}<p class="mt-2">
					<a
						class="text-brand-700 hover:underline"
						href="/panel/citas/{c.citaId}">Cita #{c.citaFolio}</a
					>
				</p>{/if}
			{#if c.notaId}<p>
					<a
						class="text-brand-700 hover:underline"
						href="/panel/notas/{c.notaId}">Nota #{c.notaFolio}</a
					>
				</p>{/if}
		</section>

		<section class="space-y-2 rounded-lg border border-sand-200 bg-white p-4">
			{#if c.autorizacionSolicitadaAt}<div class="rounded border border-ok/40 bg-ok/10 p-3 text-sm text-sand-800">
					<strong>El cliente solicitó autorizarla.</strong>
					<span class="mt-1 block text-xs">Confirma quién dio el visto bueno antes de agendar o trabajar.</span>
				</div>{/if}
			{#if c.rechazoSolicitadoAt}<div
					class="rounded border border-accent-500/40 bg-accent-500/10 p-3 text-sm text-sand-800"
				>
					<strong>El cliente pidió rechazarla.</strong>{#if c.rechazoSolicitadoMotivo}<span
							class="mt-1 block text-xs">{c.rechazoSolicitadoMotivo}</span
						>{/if}
				</div>{/if}
			{#if c.estado === "borrador" && data.puede.enviar}<form
					method="POST"
					action="?/estado"
				>
					<input
						type="hidden"
						name="estado"
						value="enviada"
					/><Button full
						><Mail
							size={16}
							aria-hidden="true"
						/>Marcar enviada y avisar</Button
					>
				</form>{/if}
			{#if c.estado !== "borrador" && data.puede.enviar}<form
					method="POST"
					action="?/reenviar"
				>
					<Button
						full
						variant="outline"
						><Mail
							size={16}
							aria-hidden="true"
						/>Reenviar aviso</Button
					>
				</form>{/if}
			{#if c.estado === "enviada" && data.puede.autorizar}<div class="grid grid-cols-2 gap-2">
					<Button
						href={searchHref(page.url, { drawer: "autorizar" })}
						size="sm">{c.autorizacionSolicitadaAt ? "Confirmar" : "Autorizar"}</Button
					><Button
						href={searchHref(page.url, { drawer: "rechazar" })}
						variant="outline"
						size="sm">Rechazar</Button
					>
				</div>{/if}
			{#if c.estado === "autorizada" && !c.citaId && !c.notaId && data.puede.agendar}<Button
					href={`/panel/agenda?drawer=nueva&cotizacionId=${c.id}`}
					full
					><CalendarPlus
						size={16}
						aria-hidden="true"
					/>Agendar servicio</Button
				>{/if}
		</section>

		{#if c.estado !== "borrador" && liga}
			<section class="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm">
				<h2 class="font-medium text-brand-950">Liga para el cliente</h2>
				<p class="mt-1 break-all text-xs text-brand-800">{liga}</p>
				<div class="mt-3 flex gap-2">
					<Button
						href={liga}
						target="_blank"
						size="sm"
						variant="outline">Abrir</Button
					><Button
						type="button"
						size="sm"
						onclick={copiarLiga}
						><Copy
							size={15}
							aria-hidden="true"
						/>{copiada ? "Copiada" : "Copiar"}</Button
					>
				</div>
			</section>
		{/if}
	</aside>
</div>

{#if drawer === "editar" && data.puede.editar && c.estado === "borrador"}
	<Drawer
		title="Editar cotización #{c.folio}"
		description="Los importes quedan congelados al enviarla."
		closeHref={closeDrawer}
		><form
			method="POST"
			action="?/actualizar"
			class="space-y-4"
		>
			<ConceptosForm
				bind:filas
				productos={data.productos}
				montoName="precioUnitario"
				montoLabel="Precio unitario"
				tipos={tiposConcepto}
				formatoOpcion={formatoOpcionProducto}
				onProducto={alElegirProducto}
			/>
			<dl class="rounded border border-sand-200 bg-sand-50 p-3 text-sm">
				<div class="flex justify-between">
					<dt>Subtotal</dt>
					<dd>{formatoPesos(previa.subtotal)}</dd>
				</div>
				<div class="flex justify-between">
					<dt>IVA</dt>
					<dd>{formatoPesos(previa.iva)}</dd>
				</div>
				<div class="mt-1 flex justify-between border-t pt-1 font-medium">
					<dt>Total</dt>
					<dd>{formatoPesos(previa.total)}</dd>
				</div>
			</dl>
			<Field
				label="Vigencia"
				name="vigenciaHasta"
				type="date"
				value={c.vigenciaHasta?.slice(0, 10) ?? ""}
			/><Field
				label="Notas"
				name="notas"
				>{#snippet children(id)}<textarea
						{id}
						name="notas"
						rows="2"
						class={INPUT}>{c.notas ?? ""}</textarea
					>{/snippet}</Field
			><Button full>Guardar cambios</Button>
		</form></Drawer
	>
{/if}

{#if drawer === "autorizar" && data.puede.autorizar && c.estado === "enviada"}
	<Drawer
		title="Autorizar cotización"
		description="Registra quién dio el visto bueno y por qué medio."
		closeHref={closeDrawer}
		><form
			method="POST"
			action="?/estado"
			class="space-y-4"
		>
			<input
				type="hidden"
				name="estado"
				value="autorizada"
			/>{#if c.clienteTipo === "organizacion"}<Field
					label="Contacto autorizador"
					name="contactoId"
					>{#snippet children(id)}<select
							{id}
							name="contactoId"
							required
							class={INPUT}
							><option value="">Selecciona…</option
							>{#each data.contactos as contacto (contacto.id)}<option value={contacto.id}
									>{contacto.nombre}</option
								>{/each}</select
						>{/snippet}</Field
				>{/if}<Field
				label="Medio"
				name="medio"
				hint="Por ejemplo: WhatsApp, teléfono o en persona."
			/><Button full>Registrar autorización</Button>
		</form></Drawer
	>
{/if}

{#if drawer === "rechazar" && data.puede.autorizar && c.estado === "enviada"}
	<Drawer
		title="Rechazar cotización"
		description="El motivo queda en el historial comercial."
		closeHref={closeDrawer}
		><form
			method="POST"
			action="?/estado"
			class="space-y-4"
		>
			<input
				type="hidden"
				name="estado"
				value="rechazada"
			/><Field
				label="Motivo"
				name="motivo"
				value={c.rechazoSolicitadoMotivo ?? ""}
				required
			/><Button
				full
				variant="outline">Registrar rechazo</Button
			>
		</form></Drawer
	>
{/if}
