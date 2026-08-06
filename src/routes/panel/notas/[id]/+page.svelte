<script lang="ts">
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import ClipboardCheck from "@lucide/svelte/icons/clipboard-check";
	import Wrench from "@lucide/svelte/icons/wrench";
	import Camera from "@lucide/svelte/icons/camera";
	import MessageSquare from "@lucide/svelte/icons/message-square";
	import Ban from "@lucide/svelte/icons/ban";
	import PackageCheck from "@lucide/svelte/icons/package-check";
	import Gauge from "@lucide/svelte/icons/gauge";
	import Fuel from "@lucide/svelte/icons/fuel";
	import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
	import Share2 from "@lucide/svelte/icons/share-2";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import EvidenciaSubir from "$lib/components/EvidenciaSubir.svelte";
	import {
		COMBUSTIBLE_LABELS,
		FOTO_CATEGORIAS,
		INVENTARIO_ITEMS,
		INVENTARIO_ITEM_KEYS,
		QA_RESULTADOS,
		QA_RESULTADO_KEYS,
		fotoCategoriaLabel,
		inventarioLabel,
		notaEstadoLabel,
		notaEstadoTone,
		qaResultadoLabel,
		qaResultadoTone,
	} from "$lib/notas";
	import { formatoPesos } from "$lib/comercial";
	import { fechaLarga, horaCorta } from "$lib/agenda";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const n = $derived(data.nota);
	const drawer = $derived(page.url.searchParams.get("drawer"));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null }));

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const inventarioPorItem = $derived(
		Object.fromEntries(data.inventario.map((i) => [i.item, i.presente])),
	);
	const fechaHora = (iso: string) =>
		`${fechaLarga(iso.slice(0, 10)).replace(/^\w+, /, "")} · ${horaCorta(new Date(iso))}`;

	const fotosPorCategoria = $derived(
		Object.groupBy(data.evidencias, (e) => e.categoria) as Record<string, typeof data.evidencias>,
	);
	const faltanFotos = $derived(
		(["frente", "trasera", "lateral_izquierdo", "lateral_derecho", "tablero"] as const).filter(
			(c) => !data.evidencias.some((e) => e.categoria === c),
		),
	);
</script>

<svelte:head><title>Nota #{n.folio} — Estación 360</title></svelte:head>

<a href="/panel/notas" class="mb-4 inline-flex items-center gap-1.5 text-sm text-sand-600 hover:text-brand-700">
	<ArrowLeft size={16} aria-hidden="true" />
	Notas de servicio
</a>

<PageHeader title="Nota #{n.folio}" description="{n.clienteNombre} · {n.unidadEtiqueta}">
	{#snippet actions()}
		{#if data.puede.inspeccionar && n.estado !== "entregada" && n.estado !== "cancelada"}
			<Button href={searchHref(page.url, { drawer: "inspeccion" })} variant={n.inspeccionada ? "outline" : "primary"}>
				<ClipboardCheck size={18} aria-hidden="true" />
				{n.inspeccionada ? "Editar inspección" : "Inspeccionar"}
			</Button>
		{/if}
	{/snippet}
</PageHeader>

{#if form?.message}
	<p role="alert" class="mb-4 rounded border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-900">
		{form.message}
	</p>
{/if}

<div class="mb-5 flex flex-wrap items-center gap-2">
	<Badge tone={notaEstadoTone(n.estado)}>{n.estadoLabel}</Badge>
	{#if n.tallerActualNombre}<Badge tone="brand">En {n.tallerActualNombre}</Badge>{/if}
	{#if n.citaFolio}<Badge tone="neutral">Cita #{n.citaFolio}</Badge>{/if}
	{#if !n.inspeccionada}<Badge tone="warn">Sin inspección</Badge>{/if}
</div>

{#if n.estado === "cancelada" && n.canceladoMotivo}
	<p class="mb-5 rounded border border-sand-300 bg-sand-100 px-3 py-2 text-sm text-sand-700">
		<strong>Cancelada:</strong> {n.canceladoMotivo}
	</p>
{/if}

{#if !n.inspeccionada && n.estado !== "cancelada"}
	<div class="mb-5 rounded-lg border-2 border-accent-500 bg-accent-500/10 p-4">
		<p class="flex items-center gap-2 font-bold text-sand-900">
			<TriangleAlert size={18} aria-hidden="true" />
			Falta la inspección de entrada
		</p>
		<p class="mt-1 text-sm text-sand-700">
			Registra kilometraje, combustible, condición e inventario antes de mover la unidad. Es lo que
			protege al taller si después aparece un daño o falta algo.
		</p>
	</div>
{/if}

<div class="grid gap-4 md:grid-cols-2">
	<!-- Entrada -->
	<section class="rounded-lg border border-sand-200 bg-white p-5">
		<h2 class="font-display text-lg text-sand-950">Entrada</h2>
		<dl class="mt-3 space-y-2 text-sm">
			<div><dt class="text-sand-500">Recibida</dt><dd class="text-sand-950">{fechaHora(n.recibidaAt)}</dd></div>
			<div><dt class="text-sand-500">Por</dt><dd class="text-sand-950">{n.recibidaPorNombre ?? "—"}</dd></div>
			<div>
				<dt class="flex items-center gap-1.5 text-sand-500"><Gauge size={14} aria-hidden="true" />Kilometraje</dt>
				<dd class="text-sand-950">
					{n.kilometraje === null ? "Sin registrar" : `${n.kilometraje.toLocaleString("es-MX")} km`}
					{#if n.unidadId}
						· <a class="text-brand-700 hover:underline" href="/panel/unidades/{n.unidadId}">Historial</a>
					{/if}
				</dd>
			</div>
			<div>
				<dt class="flex items-center gap-1.5 text-sand-500"><Fuel size={14} aria-hidden="true" />Combustible</dt>
				<dd class="text-sand-950">{n.combustibleLabel}</dd>
			</div>
			{#if n.condicion}
				<div><dt class="text-sand-500">Condición</dt><dd class="whitespace-pre-wrap text-sand-950">{n.condicion}</dd></div>
			{/if}
		</dl>
	</section>

	<!-- Unidad y cliente -->
	<section class="rounded-lg border border-sand-200 bg-white p-5">
		<h2 class="font-display text-lg text-sand-950">Cliente y unidad</h2>
		<dl class="mt-3 space-y-2 text-sm">
			<div>
				<dt class="text-sand-500">Cliente</dt>
				<dd><a class="text-brand-700 hover:underline" href="/panel/clientes/{n.clienteId}">{n.clienteNombre}</a></dd>
			</div>
			{#if n.clienteTelefono}
				<div>
					<dt class="text-sand-500">Teléfono</dt>
					<dd><a class="text-brand-700 hover:underline" href="tel:{n.clienteTelefono}">{n.clienteTelefono}</a></dd>
				</div>
			{/if}
			<div>
				<dt class="text-sand-500">Unidad</dt>
				<dd><a class="text-brand-700 hover:underline" href="/panel/unidades/{n.unidadId}">{n.unidadEtiqueta}</a></dd>
			</div>
			{#if n.unidadNumeroEconomico}
				<div><dt class="text-sand-500">Número económico</dt><dd class="font-mono text-sand-950">{n.unidadNumeroEconomico}</dd></div>
			{/if}
			{#if n.unidadVin}
				<div><dt class="text-sand-500">VIN</dt><dd class="font-mono text-xs text-sand-950">{n.unidadVin}</dd></div>
			{/if}
		</dl>

		{#if data.seguimientoToken}
			<!--
				The customer's follow-along link. `deliverInvitation` is the precedent for the seam:
				sending it is a person tapping WhatsApp, not an integration we have yet.
				The message is pre-filled so nobody has to explain the link every time.
			-->
			<div class="mt-4 border-t border-sand-200 pt-4">
				<p class="flex items-center gap-1.5 text-sm font-medium text-sand-900">
					<Share2 size={16} aria-hidden="true" />
					Liga de seguimiento
				</p>
				<p class="mt-1 text-xs leading-relaxed text-sand-600">
					El cliente ve el avance de su unidad y puede activar avisos. No muestra el taller aliado.
				</p>
				<p class="mt-2 break-all rounded border border-sand-200 bg-sand-50 px-2 py-1.5 font-mono text-[11px] text-sand-700">
					{page.url.origin}/seguimiento/{data.seguimientoToken}
				</p>
				<div class="mt-2 flex flex-wrap gap-2">
					<Button href="/seguimiento/{data.seguimientoToken}" target="_blank" variant="ghost" size="sm">
						Abrir
					</Button>
					{#if n.clienteTelefono}
						<Button
							href="https://wa.me/{n.clienteTelefono.replace(/\D/g, '')}?text={encodeURIComponent(
								`Hola, aquí puedes seguir el avance de tu unidad en Estación 360: ${page.url.origin}/seguimiento/${data.seguimientoToken}`,
							)}"
							target="_blank"
							variant="outline"
							size="sm"
						>
							Enviar por WhatsApp
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</section>

	<!-- Motivo -->
	<section class="rounded-lg border border-sand-200 bg-white p-5 md:col-span-2">
		<h2 class="font-display text-lg text-sand-950">Motivo de entrada</h2>
		<p class="mt-2 whitespace-pre-wrap text-sm text-sand-800">{n.motivo}</p>
		{#if n.diagnostico}
			<h3 class="mt-4 text-sm font-medium text-sand-700">Diagnóstico</h3>
			<p class="mt-1 whitespace-pre-wrap text-sm text-sand-600">{n.diagnostico}</p>
		{/if}
		{#if n.observaciones}
			<h3 class="mt-4 text-sm font-medium text-sand-700">Observaciones</h3>
			<p class="mt-1 whitespace-pre-wrap text-sm text-sand-600">{n.observaciones}</p>
		{/if}
	</section>

	<!-- Inventario -->
	<section class="rounded-lg border border-sand-200 bg-white p-5">
		<h2 class="font-display text-lg text-sand-950">Inventario de entrada</h2>
		{#if data.inventario.length === 0}
			<p class="mt-2 text-sm text-sand-500">Todavía no se levanta.</p>
		{:else}
			<ul class="mt-3 grid gap-1 text-sm sm:grid-cols-2">
				{#each data.inventario as i (i.item)}
					<li class="flex items-center gap-1.5">
						<span class={i.presente ? "text-ok" : "text-sand-400"} aria-hidden="true">
							{i.presente ? "✓" : "✕"}
						</span>
						<span class={i.presente ? "text-sand-800" : "text-sand-500 line-through"}>
							{inventarioLabel(i.item)}
						</span>
					</li>
				{/each}
			</ul>
			{#if data.faltantes.length > 0}
				<p class="mt-3 text-xs text-sand-500">
					Sin responder: {data.faltantes.map(inventarioLabel).join(", ")}
				</p>
			{/if}
		{/if}
	</section>

	<!-- Talleres -->
	<section class="rounded-lg border border-sand-200 bg-white p-5">
		<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
			<Wrench size={18} aria-hidden="true" />
			Talleres aliados
		</h2>
		{#if data.transferencias.length === 0}
			<p class="mt-2 text-sm text-sand-500">No se ha mandado a ningún taller.</p>
		{:else}
			<ul class="mt-3 space-y-2 text-sm">
				{#each data.transferencias as t (t.id)}
					<li class="rounded border p-2 {t.rechazada ? 'border-danger/40 bg-danger/5' : 'border-sand-200'}">
						<span class="flex flex-wrap items-center gap-2">
							<span class="font-medium text-sand-950">{t.tallerNombre}</span>
							{#if t.rechazada}
								<Badge tone="danger">Rechazado · en retrabajo</Badge>
							{:else if t.abierta}
								<Badge tone="brand">Allá ahora</Badge>
							{/if}
							{#if t.qaResultado && !t.rechazada}
								<Badge tone={qaResultadoTone(t.qaResultado)}>{qaResultadoLabel(t.qaResultado)}</Badge>
							{/if}
						</span>
						<span class="block text-xs text-sand-500">
							{fechaHora(t.desde)}{t.hasta ? ` → ${fechaHora(t.hasta)}` : ""} · {t.enviadaPor ?? "—"}
						</span>
						<span class="mt-1 block text-sand-700">{t.motivo}</span>
						{#if t.resultado}<span class="mt-1 block text-xs text-sand-600">Reporte: {t.resultado}</span>{/if}
						{#if t.qaResultado}
							<span class="mt-1 block text-xs text-sand-600">
								Calidad: {qaResultadoLabel(t.qaResultado)}
								{#if t.qaPor}· revisó {t.qaPor}{/if}
								{#if t.qaAt}· {fechaHora(t.qaAt)}{/if}
								{#if t.qaNotas}<span class="block">{t.qaNotas}</span>{/if}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.puede.transferir && n.estado !== "entregada" && n.estado !== "cancelada"}
			<div class="mt-3 flex flex-wrap gap-2">
				<!-- Receiving is the ONLY way out of `en_taller`: the quality check cannot be skipped. -->
				{#if n.estado === "en_taller"}
					<Button href={searchHref(page.url, { drawer: "recibirTaller" })} size="sm">
						<ClipboardCheck size={16} aria-hidden="true" />
						Recibir del taller (calidad)
					</Button>
				{/if}
				<Button href={searchHref(page.url, { drawer: "transferir" })} variant="outline" size="sm">
					<Wrench size={16} aria-hidden="true" />
					{n.tallerActualNombre ? "Mover a otro taller" : "Mandar a un taller"}
				</Button>
			</div>
		{/if}
	</section>

	<!-- Evidencia -->
	<section class="rounded-lg border border-sand-200 bg-white p-5 md:col-span-2">
		<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
			<Camera size={18} aria-hidden="true" />
			Evidencia
			<span class="text-sm font-normal text-sand-500">({data.evidencias.length})</span>
		</h2>

		{#if faltanFotos.length > 0}
			<p class="mt-2 text-xs text-sand-500">
				Faltan ángulos sugeridos: {faltanFotos.map(fotoCategoriaLabel).join(", ")}
			</p>
		{/if}

		{#if data.evidencias.length > 0}
			<div class="mt-3 space-y-4">
				{#each Object.entries(fotosPorCategoria) as [categoria, fotos] (categoria)}
					<div>
						<h3 class="text-xs font-medium uppercase tracking-wide text-sand-500">
							{fotoCategoriaLabel(categoria)}
						</h3>
						<div class="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
							{#each fotos ?? [] as e (e.id)}
								<a
									href={e.url ?? "#"}
									target="_blank"
									rel="noopener"
									class="group block overflow-hidden rounded border border-sand-200 hover:border-brand-600"
								>
									{#if e.tipo === "foto" && e.url}
										<img src={e.url} alt={e.descripcion ?? e.nombre} class="aspect-square w-full object-cover" />
									{:else}
										<span class="flex aspect-square w-full items-center justify-center bg-sand-100 p-2 text-center text-xs text-sand-600">
											{e.nombre}
										</span>
									{/if}
								</a>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if data.puede.inspeccionar && n.estado !== "cancelada"}
			{#if data.r2}
				<EvidenciaSubir notaId={n.id} categorias={Object.entries(FOTO_CATEGORIAS).map(([value, v]) => ({ value, label: v.label }))} />
			{:else}
				<p class="mt-3 rounded border border-sand-300 bg-sand-100 px-3 py-2 text-xs text-sand-600">
					El almacenamiento de fotos (Cloudflare R2) no está configurado todavía. Falta
					<code>R2_ACCOUNT_ID</code>, <code>R2_BUCKET</code>, <code>R2_ACCESS_KEY_ID</code> y
					<code>R2_SECRET_ACCESS_KEY</code>.
				</p>
			{/if}
		{/if}
	</section>

	<!-- Dinero -->
	{#if data.puede.verDinero}
		<section class="rounded-lg border border-sand-200 bg-white p-5 md:col-span-2">
			<h2 class="font-display text-lg text-sand-950">Cotizaciones y facturas</h2>

			{#if data.credito}
				<p class="mt-2 text-xs text-sand-600">
					Crédito del cliente:
					{#if data.credito.limite}
						saldo <strong>{formatoPesos(Number(data.credito.saldo))}</strong> de
						{formatoPesos(Number(data.credito.limite))} · disponible
						{formatoPesos(Number(data.credito.disponible))} · {data.credito.diasCredito} días
					{:else}
						sin línea de crédito (cobro de contado)
					{/if}
				</p>
			{/if}

			{#if data.cotizaciones.length === 0 && data.facturas.length === 0}
				<p class="mt-2 text-sm text-sand-500">Nada cotizado ni facturado todavía.</p>
			{:else}
				<ul class="mt-3 space-y-2 text-sm">
					{#each data.cotizaciones as c (c.id)}
						<li class="flex flex-wrap items-center gap-2 rounded border border-sand-200 p-2">
							<span class="font-medium text-sand-950">Cotización #{c.folio}</span>
							<Badge tone="neutral">{c.estadoLabel}</Badge>
							<span class="text-sand-700">{formatoPesos(Number(c.total))}</span>
							{#if c.autorizadaPorNombre}
								<span class="text-xs text-sand-500">Autorizó {c.autorizadaPorNombre}</span>
							{/if}
						</li>
					{/each}
					{#each data.facturas as f (f.id)}
						<li class="flex flex-wrap items-center gap-2 rounded border border-sand-200 p-2">
							<span class="font-medium text-sand-950">Factura #{f.folio}</span>
							<Badge tone={f.liquidada ? "ok" : "warn"}>{f.estadoLabel}</Badge>
							<span class="text-sand-700">{formatoPesos(Number(f.total))}</span>
							{#if !f.liquidada}
								<span class="text-xs text-sand-500">Saldo {formatoPesos(Number(f.saldo))}</span>
							{/if}
							{#if f.vence}
								<span class="text-xs text-sand-500">Vence {f.vence.slice(0, 10)}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			<p class="mt-3 text-xs text-sand-500">
				Cotizar, facturar y registrar pagos se hace por API
				(<code>/api/notas/{n.id}/cotizaciones</code>, <code>/api/facturas</code>).
			</p>
		</section>
	{/if}

	<!-- Comentarios -->
	<section class="rounded-lg border border-sand-200 bg-white p-5 md:col-span-2">
		<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
			<MessageSquare size={18} aria-hidden="true" />
			Comentarios
		</h2>
		{#if data.comentarios.length === 0}
			<p class="mt-2 text-sm text-sand-500">Sin comentarios.</p>
		{:else}
			<ul class="mt-3 space-y-2">
				{#each data.comentarios as c (c.id)}
					<li class="rounded border border-sand-200 p-2 text-sm {c.interno ? '' : 'border-brand-200 bg-brand-50'}">
						<span class="flex flex-wrap items-center gap-2 text-xs text-sand-500">
							{c.autorEmail} · {fechaHora(c.createdAt)}
							{#if !c.interno}<Badge tone="brand">Visible al cliente</Badge>{/if}
						</span>
						<p class="mt-1 whitespace-pre-wrap text-sand-800">{c.texto}</p>
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.puede.comentar}
			<form method="POST" action="?/comentar" class="mt-3 space-y-2">
				<Field label="Nuevo comentario" name="texto">
					{#snippet children(id)}
						<textarea {id} name="texto" required rows="2" class={INPUT}></textarea>
					{/snippet}
				</Field>
				<label class="flex items-center gap-2 text-sm text-sand-700">
					<input type="checkbox" name="interno" value="1" checked class="size-4 accent-brand-600" />
					Interno (no se le muestra al cliente)
				</label>
				<Button size="sm">Comentar</Button>
			</form>
		{/if}
	</section>
</div>

<!-- Acciones -->
<div class="mt-5 flex flex-wrap items-center gap-2">
	{#if data.puede.avanzar}
		{#each data.siguientes as estado (estado)}
			<form method="POST" action="?/avanzar">
				<input type="hidden" name="estado" value={estado} />
				<Button variant="outline" size="sm">Marcar {notaEstadoLabel(estado).toLowerCase()}</Button>
			</form>
		{/each}
	{/if}
	{#if data.puede.entregar && n.estado === "lista"}
		<Button href={searchHref(page.url, { drawer: "entregar" })} size="sm">
			<PackageCheck size={16} aria-hidden="true" />
			Entregar unidad
		</Button>
	{/if}
	{#if data.puede.cancelar && n.estado !== "cancelada" && n.estado !== "entregada"}
		<Button href={searchHref(page.url, { drawer: "cancelar" })} variant="ghost" size="sm">
			<Ban size={16} aria-hidden="true" />
			Cancelar nota
		</Button>
	{/if}
</div>

{#if drawer === "inspeccion" && data.puede.inspeccionar}
	<Drawer
		title="Inspección de entrada"
		description="Lo que protege al taller si después aparece un daño o falta algo."
		closeHref={closeDrawer}
	>
		<form method="POST" action="?/inspeccionar" class="space-y-4">
			<Field
				label="Kilometraje"
				name="kilometraje"
				type="number"
				min="0"
				value={n.kilometraje ? String(n.kilometraje) : ""}
				hint="Se guarda también en el historial de la unidad."
			/>
			<label class="flex items-center gap-2 text-sm text-sand-700">
				<input type="checkbox" name="forzarKilometraje" value="1" class="size-4 accent-brand-600" />
				Es una corrección (menor al último registrado)
			</label>

			<Field label="Combustible" name="combustibleOctavos">
				{#snippet children(id)}
					<select {id} name="combustibleOctavos" class={INPUT}>
						<option value="">Sin registrar</option>
						{#each Object.entries(COMBUSTIBLE_LABELS) as [octavos, label] (octavos)}
							<option value={octavos} selected={String(n.combustibleOctavos) === octavos}>{label}</option>
						{/each}
					</select>
				{/snippet}
			</Field>

			<Field label="Condición de la unidad" name="condicion">
				{#snippet children(id)}
					<textarea
						{id}
						name="condicion"
						rows="3"
						class={INPUT}
						placeholder="Rayón en puerta trasera derecha, faro izquierdo estrellado…">{n.condicion ?? ""}</textarea
					>
				{/snippet}
			</Field>

			<fieldset class="rounded border border-sand-200 p-3">
				<legend class="px-1 text-sm font-medium text-sand-700">Inventario</legend>
				<p class="text-xs text-sand-500">Marca lo que SÍ viene en la unidad.</p>
				<div class="mt-2 space-y-1">
					{#each INVENTARIO_ITEM_KEYS as item (item)}
						<label class="flex items-center gap-2 text-sm text-sand-700">
							<!-- The hidden field submits the full catalogue, so an unchecked box means
							     "not present" instead of "not answered". -->
							<input type="hidden" name="inventarioItem" value={item} />
							<input
								type="checkbox"
								name="inventario"
								value={item}
								checked={inventarioPorItem[item] === true}
								class="size-4 accent-brand-600"
							/>
							{INVENTARIO_ITEMS[item].label}
							{#if INVENTARIO_ITEMS[item].obligatorio}<span class="text-xs text-sand-400">*</span>{/if}
						</label>
					{/each}
				</div>
			</fieldset>

			<Field label="Observaciones" name="observaciones">
				{#snippet children(id)}
					<textarea {id} name="observaciones" rows="2" class={INPUT}>{n.observaciones ?? ""}</textarea>
				{/snippet}
			</Field>

			<Button full>Guardar inspección</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "transferir" && data.puede.transferir}
	<Drawer
		title="Mandar a un taller aliado"
		description="La unidad sale del taller. Queda registrado a dónde y para qué."
		closeHref={closeDrawer}
	>
		<form method="POST" action="?/transferir" class="space-y-4">
			<Field label="Taller" name="tallerId">
				{#snippet children(id)}
					<select {id} name="tallerId" required class={INPUT}>
						<option value="">Elige…</option>
						{#each data.talleres as t (t.id)}
							<option value={t.id} selected={n.tallerActualId === t.id}>
								{t.nombre}{t.especialidades ? ` · ${t.especialidades}` : ""}
							</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			{#if data.talleres.length === 0}
				<p class="text-xs text-sand-500">
					No hay talleres dados de alta. <a class="underline" href="/panel/talleres">Agrégalos aquí</a>.
				</p>
			{/if}
			<Field label="¿Para qué?" name="motivo">
				{#snippet children(id)}
					<textarea {id} name="motivo" required rows="2" class={INPUT} placeholder="Hojalatería y pintura de puerta trasera"></textarea>
				{/snippet}
			</Field>
			<Button full>Enviar al taller</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "recibirTaller" && data.puede.transferir}
	<Drawer
		title="Recibir del taller aliado"
		description="Nada regresa sin revisión. Estación 360 responde por el trabajo ante el cliente."
		closeHref={closeDrawer}
	>
		<form method="POST" action="?/recibirTaller" class="space-y-4">
			<p class="rounded border border-sand-200 bg-sand-50 p-3 text-sm text-sand-700">
				Viene de <strong>{n.tallerActualNombre}</strong>
			</p>

			<fieldset class="rounded border border-sand-200 p-3">
				<legend class="px-1 text-sm font-medium text-sand-700">¿Cómo quedó el trabajo?</legend>
				<div class="space-y-2">
					{#each QA_RESULTADO_KEYS as r (r)}
						<label class="flex cursor-pointer items-start gap-2 rounded border border-sand-200 p-2 hover:border-brand-600">
							<input type="radio" name="qaResultado" value={r} required class="mt-0.5 size-4 shrink-0 accent-brand-600" />
							<span>
								<span class="block text-sm font-medium text-sand-950">{QA_RESULTADOS[r].label}</span>
								<span class="block text-xs text-sand-500">{QA_RESULTADOS[r].descripcion}</span>
							</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<Field
				label="Observaciones de calidad"
				name="qaNotas"
				hint="Obligatorio si lo rechazas: es lo que se le reclama al taller."
			>
				{#snippet children(id)}
					<textarea
						{id}
						name="qaNotas"
						rows="3"
						class={INPUT}
						placeholder="Quedó bien la pintura, pero falta ajustar la moldura de la puerta."
					></textarea>
				{/snippet}
			</Field>

			<Field label="Lo que reportó el taller" name="resultado">
				{#snippet children(id)}
					<textarea {id} name="resultado" rows="2" class={INPUT}></textarea>
				{/snippet}
			</Field>

			<Field
				label="Kilometraje al regresar"
				name="kilometraje"
				type="number"
				min="0"
				hint="Los talleres suelen devolver la unidad con más kilómetros."
			/>

			<p class="rounded border border-accent-500/40 bg-accent-500/10 px-3 py-2 text-xs text-sand-700">
				Si rechazas el trabajo, la unidad <strong>sigue asignada a ese taller</strong> para
				retrabajo. No se entrega al cliente con una reparación mal hecha.
			</p>

			<Button full>Registrar recepción</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "entregar" && data.puede.entregar}
	<Drawer
		title="Entregar unidad"
		description="Queda registrado quién se la llevó."
		closeHref={closeDrawer}
	>
		<form method="POST" action="?/entregar" class="space-y-4">
			<Field label="¿Quién recibe?" name="contactoId" hint="Solo contactos con rol de Entregador.">
				{#snippet children(id)}
					<select {id} name="contactoId" class={INPUT}>
						<option value="">El cliente mismo</option>
						{#each data.entregadores as e (e.id)}
							<option value={e.id}>{e.nombre}{e.telefono ? ` · ${e.telefono}` : ""}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			{#if data.entregadores.length === 0}
				<p class="text-xs text-sand-500">
					Este cliente no tiene entregadores registrados.
					<a class="underline" href="/panel/clientes/{n.clienteId}">Agrégalos en su ficha</a>.
				</p>
			{/if}
			<Field label="Observaciones de entrega" name="observaciones">
				{#snippet children(id)}
					<textarea {id} name="observaciones" rows="2" class={INPUT}>{n.observaciones ?? ""}</textarea>
				{/snippet}
			</Field>
			<Button full>Marcar entregada</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "cancelar" && data.puede.cancelar}
	<Drawer title="Cancelar nota" description="El motivo queda en el expediente." closeHref={closeDrawer}>
		<form method="POST" action="?/cancelar" class="space-y-4">
			<Field label="Motivo" name="motivo" required hint="Máximo 255 caracteres." />
			<Button full>Cancelar la nota</Button>
		</form>
	</Drawer>
{/if}
