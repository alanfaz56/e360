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
	import FilePlus from "@lucide/svelte/icons/file-plus";
	import FileText from "@lucide/svelte/icons/file-text";
	import Banknote from "@lucide/svelte/icons/banknote";
	import Send from "@lucide/svelte/icons/send";
	import ThumbsUp from "@lucide/svelte/icons/thumbs-up";
	import ThumbsDown from "@lucide/svelte/icons/thumbs-down";
	import Plus from "@lucide/svelte/icons/plus";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import EvidenciaSubir from "$lib/components/EvidenciaSubir.svelte";
	import CombustibleGauge from "$lib/components/CombustibleGauge.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import {
		FOTO_CATEGORIAS,
		INVENTARIO_ITEMS,
		INVENTARIO_ITEM_KEYS,
		QA_DESTINOS,
		QA_DESTINO_KEYS,
		QA_RESULTADOS,
		QA_RESULTADO_KEYS,
		fotoCategoriaLabel,
		inventarioLabel,
		notaEstadoLabel,
		notaEstadoTone,
		qaResultadoLabel,
		qaResultadoTone,
	} from "$lib/notas";
	import Package from "@lucide/svelte/icons/package";
	import HardHat from "@lucide/svelte/icons/hard-hat";
	import {
		CONCEPTO_TIPOS,
		CONCEPTO_TIPO_KEYS,
		CONDICIONES_PAGO,
		CONDICION_PAGO_KEYS,
		METODOS_PAGO,
		METODO_PAGO_KEYS,
		centavos,
		condicionPagoLabel,
		totales,
		siguientesCliente,
		siguientesInternos,
		cotizacionEstadoTone,
		cotizacionInternoLabel,
		cotizacionInternoTone,
		facturaEstadoTone,
		formatoPesos,
	} from "$lib/comercial";
	import { solicitudEstadoLabel, solicitudEstadoTone } from "$lib/inventario";
	import { fechaLarga, horaCorta } from "$lib/agenda";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const n = $derived(data.nota);
	const drawer = $derived(page.url.searchParams.get("drawer"));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null }));

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	// Where the unit ends up is only a question on a rejection, so the block stays out of the way
	// until one is picked. `$effect` never runs during SSR, so without JavaScript `hydrated` stays
	// false and the block renders — a radio cannot hide anything without JS, and a no-JS user must
	// not lose the choice. Losing it would silently mean `retrabajo`, the server's default.
	let qaElegido = $state<string | null>(null);
	let hydrated = $state(false);
	$effect(() => {
		hydrated = true;
	});
	const mostrarDestino = $derived(!hydrated || qaElegido === "rechazado");

	// --- Constructor de cotizaciones ------------------------------------------------------------
	// Three rows exist from the first render so the drawer works with JavaScript off; `agregarFila`
	// is the enhancement. Rows are never removed — a blank row is dropped by the action, which is
	// simpler than a delete button and behaves the same.
	const filaVacia = () => ({ productoId: "", tipo: "refaccion", descripcion: "", cantidad: "1", precioUnitario: "" });
	let filas = $state([filaVacia(), filaVacia(), filaVacia()]);
	const agregarFila = () => (filas = [...filas, filaVacia()]);

	/** Picking a catalogue product fills the line in. The server does the same if JS is off. */
	function elegirProducto(i: number, id: string) {
		filas[i].productoId = id;
		const p = data.productos.find((x) => x.id === id);
		if (!p) return;
		filas[i].tipo = p.tipo;
		if (!filas[i].descripcion) filas[i].descripcion = p.nombre;
		if (!filas[i].precioUnitario) filas[i].precioUnitario = p.precioVenta;
	}

	// The same money helpers the server uses, so the total shown cannot disagree with the total
	// written. `centavos` rejects anything ambiguous, and a bad row simply contributes nothing.
	const previa = $derived(
		totales(
			filas
				.map((f) => ({ cantidad: Number(f.cantidad), precioUnitario: centavos(f.precioUnitario) ?? 0n }))
				.filter((f) => Number.isFinite(f.cantidad) && f.cantidad > 0),
		),
	);

	/** The quote a drawer is acting on, taken from the URL so the drawer survives a reload. */
	const cotizacionEnFoco = $derived(data.cotizaciones.find((c) => c.id === page.url.searchParams.get("cot")));
	const facturaEnFoco = $derived(data.facturas.find((f) => f.id === page.url.searchParams.get("fac")));

	/** A live invoice for this quote. Cancelled ones do not count — you can re-issue after one. */
	const facturaDe = (cotizacionId: string) =>
		data.facturas.find((f) => f.cotizacionId === cotizacionId && f.estado !== "cancelada");

	/**
	 * Prefilled WhatsApp message for one quote. Null when there is nothing to send it to — no
	 * phone, or no tracking link yet — so the caller renders no button instead of a dead one.
	 */
	function ligaWhatsapp(c: { folio: number; total: string }): string | null {
		if (!n.clienteTelefono || !data.seguimientoToken) return null;
		const texto =
			`Hola, aquí está tu cotización #${c.folio} de Estación 360 por ${formatoPesos(Number(c.total))}. ` +
			`Puedes verla a detalle y darnos tu visto bueno aquí: ` +
			`${page.url.origin}/seguimiento/${data.seguimientoToken}`;
		return `https://wa.me/${n.clienteTelefono.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
	}

	const inventarioPorItem = $derived(Object.fromEntries(data.inventario.map((i) => [i.item, i.presente])));
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

<a
	href="/panel/notas"
	class="mb-4 inline-flex items-center gap-1.5 text-sm text-sand-600 hover:text-brand-700"
>
	<ArrowLeft
		size={16}
		aria-hidden="true"
	/>
	Notas de servicio
</a>

<PageHeader
	title="Nota #{n.folio}"
	description="{n.clienteNombre} · {n.unidadEtiqueta}"
>
	{#snippet actions()}
		{#if data.puede.inspeccionar && n.estado !== "entregada" && n.estado !== "cancelada"}
			<Button
				href={searchHref(page.url, { drawer: "inspeccion" })}
				variant={n.inspeccionada ? "outline" : "primary"}
			>
				<ClipboardCheck
					size={18}
					aria-hidden="true"
				/>
				{n.inspeccionada ? "Editar inspección" : "Inspeccionar"}
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<Flash {form} />

<div class="mb-5 flex flex-wrap items-center gap-2">
	<Badge tone={notaEstadoTone(n.estado)}>{n.estadoLabel}</Badge>
	{#if n.tallerActualNombre}<Badge tone="brand">En {n.tallerActualNombre}</Badge>{/if}
	{#if n.citaFolio}<Badge tone="neutral">Cita #{n.citaFolio}</Badge>{/if}
	{#if !n.inspeccionada}<Badge tone="warn">Sin inspección</Badge>{/if}
</div>

{#if n.estado === "cancelada" && n.canceladoMotivo}
	<p class="mb-5 rounded border border-sand-300 bg-sand-100 px-3 py-2 text-sm text-sand-700">
		<strong>Cancelada:</strong>
		{n.canceladoMotivo}
	</p>
{/if}

{#if !n.inspeccionada && n.estado !== "cancelada"}
	<div class="mb-5 rounded-lg border-2 border-accent-500 bg-accent-500/10 p-4">
		<p class="flex items-center gap-2 font-bold text-sand-900">
			<TriangleAlert
				size={18}
				aria-hidden="true"
			/>
			Falta la inspección de entrada
		</p>
		<p class="mt-1 text-sm text-sand-700">
			Registra kilometraje, combustible, condición e inventario antes de mover la unidad. Es lo que protege al
			taller si después aparece un daño o falta algo.
		</p>
	</div>
{/if}

<div class="grid gap-4 md:grid-cols-2">
	<!-- Entrada -->
	<section class="rounded-lg border border-sand-200 bg-white p-5">
		<h2 class="font-display text-lg text-sand-950">Entrada</h2>
		<dl class="mt-3 space-y-2 text-sm">
			<div>
				<dt class="text-sand-500">Recibida</dt>
				<dd class="text-sand-950">{fechaHora(n.recibidaAt)}</dd>
			</div>
			<div>
				<dt class="text-sand-500">Por</dt>
				<dd class="text-sand-950">{n.recibidaPorNombre ?? "—"}</dd>
			</div>
			<div>
				<dt class="flex items-center gap-1.5 text-sand-500">
					<Gauge
						size={14}
						aria-hidden="true"
					/>Kilometraje
				</dt>
				<dd class="text-sand-950">
					{n.kilometraje === null ? "Sin registrar" : `${n.kilometraje.toLocaleString("es-MX")} km`}
					{#if n.unidadId}
						· <a
							class="text-brand-700 hover:underline"
							href="/panel/unidades/{n.unidadId}">Historial</a
						>
					{/if}
				</dd>
			</div>
			<div>
				<dt class="flex items-center gap-1.5 text-sand-500">
					<Fuel
						size={14}
						aria-hidden="true"
					/>Combustible
				</dt>
				<dd class="text-sand-950">{n.combustibleLabel}</dd>
			</div>
			{#if n.condicion}
				<div>
					<dt class="text-sand-500">Condición</dt>
					<dd class="whitespace-pre-wrap text-sand-950">{n.condicion}</dd>
				</div>
			{/if}
		</dl>
	</section>

	<!-- Unidad y cliente -->
	<section class="rounded-lg border border-sand-200 bg-white p-5">
		<h2 class="font-display text-lg text-sand-950">Cliente y unidad</h2>
		<dl class="mt-3 space-y-2 text-sm">
			<div>
				<dt class="text-sand-500">Cliente</dt>
				<dd>
					<a
						class="text-brand-700 hover:underline"
						href="/panel/clientes/{n.clienteId}">{n.clienteNombre}</a
					>
				</dd>
			</div>
			{#if n.clienteTelefono}
				<div>
					<dt class="text-sand-500">Teléfono</dt>
					<dd>
						<a
							class="text-brand-700 hover:underline"
							href="tel:{n.clienteTelefono}">{n.clienteTelefono}</a
						>
					</dd>
				</div>
			{/if}
			<div>
				<dt class="text-sand-500">Unidad</dt>
				<dd>
					<a
						class="text-brand-700 hover:underline"
						href="/panel/unidades/{n.unidadId}">{n.unidadEtiqueta}</a
					>
				</dd>
			</div>
			{#if n.unidadNumeroEconomico}
				<div>
					<dt class="text-sand-500">Número económico</dt>
					<dd class="font-mono text-sand-950">{n.unidadNumeroEconomico}</dd>
				</div>
			{/if}
			{#if n.unidadVin}
				<div>
					<dt class="text-sand-500">VIN</dt>
					<dd class="font-mono text-xs text-sand-950">{n.unidadVin}</dd>
				</div>
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
					<Share2
						size={16}
						aria-hidden="true"
					/>
					Liga de seguimiento
				</p>
				<p class="mt-1 text-xs leading-relaxed text-sand-600">
					El cliente ve el avance de su unidad y puede activar avisos. No muestra el taller aliado.
				</p>
				<p
					class="mt-2 break-all rounded border border-sand-200 bg-sand-50 px-2 py-1.5 font-mono text-[11px] text-sand-700"
				>
					{page.url.origin}/seguimiento/{data.seguimientoToken}
				</p>
				<div class="mt-2 flex flex-wrap gap-2">
					<Button
						href="/seguimiento/{data.seguimientoToken}"
						target="_blank"
						variant="ghost"
						size="sm"
					>
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
						<span
							class={i.presente ? "text-ok" : "text-sand-400"}
							aria-hidden="true"
						>
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
			<Wrench
				size={18}
				aria-hidden="true"
			/>
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
						{#if t.resultado}<span class="mt-1 block text-xs text-sand-600">Reporte: {t.resultado}</span
							>{/if}
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
				{#if n.estado === "en_taller"}
					<!--
						While the unit is at a partner shop, receiving it back is the ONLY thing that can
						happen: `transferirNota` refuses outright so a job can never be handed from one shop
						to the next without somebody signing off on the first one's work.

						So the transfer button is NOT offered here. It used to be, and it produced a 409 the
						drawer swallowed — an action that is always refused reads as a broken button.
					-->
					<Button
						href={searchHref(page.url, { drawer: "recibirTaller" })}
						size="sm"
					>
						<ClipboardCheck
							size={16}
							aria-hidden="true"
						/>
						Recibir del taller (calidad)
					</Button>
					<p class="w-full text-xs text-sand-500">
						Para mandarla a otro taller, recíbela aquí primero. Puedes rechazar el trabajo
						<em>y</em> recuperar la unidad en el mismo paso.
					</p>
				{:else}
					<Button
						href={searchHref(page.url, { drawer: "transferir" })}
						variant="outline"
						size="sm"
					>
						<Wrench
							size={16}
							aria-hidden="true"
						/>
						{n.tallerActualNombre ? "Mover a otro taller" : "Mandar a un taller"}
					</Button>
				{/if}
			</div>
		{/if}
	</section>

	<!-- Evidencia -->
	<section class="rounded-lg border border-sand-200 bg-white p-5 md:col-span-2">
		<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
			<Camera
				size={18}
				aria-hidden="true"
			/>
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
										<img
											src={e.url}
											alt={e.descripcion ?? e.nombre}
											class="aspect-square w-full object-cover"
										/>
									{:else}
										<span
											class="flex aspect-square w-full items-center justify-center bg-sand-100 p-2 text-center text-xs text-sand-600"
										>
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
				<EvidenciaSubir
					notaId={n.id}
					categorias={Object.entries(FOTO_CATEGORIAS).map(([value, v]) => ({ value, label: v.label }))}
				/>
			{:else}
				<p class="mt-3 rounded border border-sand-300 bg-sand-100 px-3 py-2 text-xs text-sand-600">
					El almacenamiento de fotos (Cloudflare R2) no está configurado todavía. Falta
					<code>R2_ACCOUNT_ID</code>, <code>R2_BUCKET</code>, <code>R2_ACCESS_KEY_ID</code> y
					<code>R2_SECRET_ACCESS_KEY</code>.
				</p>
			{/if}
		{/if}
	</section>

	<!-- Mecánico y refacciones -->
	<section class="rounded-lg border border-sand-200 bg-white p-5 md:col-span-2">
		<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
			<HardHat
				size={18}
				aria-hidden="true"
			/>
			Mecánico
		</h2>

		<p class="mt-2 flex flex-wrap items-center gap-2 text-sm">
			{#if n.mecanicoNombre}
				<span class="font-medium text-sand-950">{n.mecanicoNombre}</span>
				{#if n.trabajoTerminadoAt}
					<Badge tone="ok">Terminó su trabajo</Badge>
				{:else}
					<Badge tone="brand">Trabajando</Badge>
				{/if}
			{:else}
				<span class="text-sand-500">Sin asignar</span>
			{/if}
		</p>

		{#if data.puede.asignarMecanico}
			<form
				method="POST"
				action="?/mecanico"
				class="mt-3 flex flex-wrap items-end gap-2"
			>
				<div class="min-w-48 flex-1">
					<Field
						label="Asignar a"
						name="mecanicoId"
					>
						{#snippet children(id)}
							<select
								{id}
								name="mecanicoId"
								class={INPUT}
							>
								<option value="">Sin asignar</option>
								{#each data.mecanicos as m (m.id)}
									<option
										value={m.id}
										selected={n.mecanicoId === m.id}>{m.name}</option
									>
								{/each}
							</select>
						{/snippet}
					</Field>
				</div>
				<Button
					size="sm"
					variant="outline">Guardar</Button
				>
			</form>
			{#if data.mecanicos.length === 0}
				<p class="mt-2 text-xs text-sand-500">
					No hay cuentas con rol Taller Mecánico todavía.
					<a
						class="underline"
						href="/panel/usuarios">Invita a una</a
					>.
				</p>
			{/if}
		{/if}

		{#if data.solicitudes.length > 0}
			<h3 class="mt-5 flex items-center gap-2 text-sm font-medium text-sand-900">
				<Package
					size={16}
					aria-hidden="true"
				/>
				Refacciones pedidas
			</h3>
			<ul class="mt-2 space-y-2">
				{#each data.solicitudes as s (s.id)}
					<li class="rounded border border-sand-200 p-2.5 text-sm">
						<p class="flex flex-wrap items-center gap-2">
							<span class="font-medium text-sand-900">
								{Number(s.cantidad).toLocaleString("es-MX")} × {s.descripcion}
							</span>
							<Badge tone={solicitudEstadoTone(s.estado)}>{solicitudEstadoLabel(s.estado)}</Badge>
							{#if s.productoNombre}
								<span class="text-xs text-sand-500">
									{s.productoNombre} · hay {Number(s.existencia).toLocaleString("es-MX")}
								</span>
							{/if}
						</p>
						{#if s.resolucionMotivo}
							<p class="mt-1 text-xs text-sand-600">{s.resolucionMotivo}</p>
						{/if}

						{#if s.estado === "pendiente" && data.puede.surtir}
							<div class="mt-2 flex flex-col gap-2 sm:flex-row">
								{#if s.productoId}
									<form
										method="POST"
										action="?/resolverRefaccion"
										class="flex-1"
									>
										<input
											type="hidden"
											name="id"
											value={s.id}
										/>
										<input
											type="hidden"
											name="estado"
											value="surtida"
										/>
										<Button
											size="sm"
											full>Surtir</Button
										>
									</form>
								{/if}
								<form
									method="POST"
									action="?/resolverRefaccion"
									class="flex-1 space-y-2"
								>
									<input
										type="hidden"
										name="id"
										value={s.id}
									/>
									<input
										type="hidden"
										name="estado"
										value="rechazada"
									/>
									<input
										name="motivo"
										required
										placeholder="¿Por qué no hay?"
										class={INPUT}
									/>
									<Button
										size="sm"
										variant="outline"
										full>No hay</Button
									>
								</form>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Dinero -->
	{#if data.puede.verDinero}
		<section class="rounded-lg border border-sand-200 bg-white p-5 md:col-span-2">
			<div class="flex flex-wrap items-center gap-2">
				<h2 class="font-display text-lg text-sand-950">Cotizaciones y facturas</h2>
				{#if data.puede.cotizar && n.estado !== "cancelada"}
					<Button
						href={searchHref(page.url, { drawer: "cotizar" })}
						size="sm"
						class="sm:ml-auto"
					>
						<FilePlus
							size={16}
							aria-hidden="true"
						/>
						Nueva cotización
					</Button>
				{/if}
			</div>

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
						{@const faltaSurtir = c.conceptos.some((x) => x.productoId && !x.surtidoCompleto)}
						<li class="rounded border border-sand-200 p-3">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium text-sand-950">Cotización #{c.folio}</span>
								<!-- Two axes, two badges: what the CUSTOMER said, and what the SHOP is doing. -->
								<Badge tone={cotizacionEstadoTone(c.estado)}>{c.estadoLabel}</Badge>
								<Badge tone={cotizacionInternoTone(c.estadoInterno)}>{c.estadoInternoLabel}</Badge>
								<span class="ml-auto font-medium text-sand-900">{formatoPesos(Number(c.total))}</span>
							</div>
							{#if c.autorizadaPorNombre}
								<p class="mt-1 text-xs text-sand-500">Autorizó {c.autorizadaPorNombre}</p>
							{/if}

							{#if c.conceptos.length > 0}
								<ul class="mt-2 space-y-0.5 text-xs text-sand-600">
									{#each c.conceptos as x (x.id)}
										<li class="flex flex-wrap gap-1.5">
											<span>{x.cantidad} × {x.descripcion}</span>
											{#if x.productoId}
												{#if x.surtidoCompleto}
													<span class="text-ok">· surtido</span>
												{:else}
													<span class="text-accent-700">· falta surtir</span>
												{/if}
											{/if}
											<span class="ml-auto">{formatoPesos(Number(x.importe))}</span>
										</li>
									{/each}
								</ul>
							{/if}

							{#if c.rechazadaMotivo}
								<p class="mt-1 text-xs text-danger">Rechazó: {c.rechazadaMotivo}</p>
							{/if}

							<div class="mt-2 flex flex-wrap gap-1.5">
								<!--
									The CUSTOMER's axis. Rendered from COTIZACION_TRANSICIONES, so a state with
									nowhere to go shows no buttons instead of ones the server would refuse.

									"Enviar" is a one-click form; the other two open a drawer, because a rejection
									needs its motivo and an authorisation needs to name WHO approved.
								-->
								{#if data.puede.cotizar}
									{#each siguientesCliente(c.estado) as destino (destino)}
										{#if destino === "enviada"}
											{#if data.puede.enviarCotizacion}
												<form
													method="POST"
													action="?/estadoCotizacion"
												>
													<input
														type="hidden"
														name="cotizacionId"
														value={c.id}
													/>
													<input
														type="hidden"
														name="estado"
														value="enviada"
													/>
													<Button size="sm">
														<Send
															size={14}
															aria-hidden="true"
														/>
														Enviar al cliente
													</Button>
												</form>
											{/if}
										{:else if destino === "autorizada"}
											<Button
												href={searchHref(page.url, { drawer: "autorizar", cot: c.id })}
												size="sm"
												variant="outline"
											>
												<ThumbsUp
													size={14}
													aria-hidden="true"
												/>
												Autorizó el cliente
											</Button>
										{:else if destino === "rechazada"}
											<Button
												href={searchHref(page.url, { drawer: "rechazar", cot: c.id })}
												size="sm"
												variant="ghost"
											>
												<ThumbsDown
													size={14}
													aria-hidden="true"
												/>
												La rechazó
											</Button>
										{/if}
									{/each}
								{/if}

								<!--
									Marking it "enviada" and actually SENDING it are two acts, so they are two
									buttons. The estado is the shop's record; the WhatsApp link is the message,
									and it stays available afterwards because "¿me la puedes reenviar?" is the
									most ordinary request there is.

									The deep link is the same `/seguimiento/<token>` page where the customer
									already sees the line items — no second surface to keep in sync, and the
									partner taller stays absent by construction.
								-->
								{#if c.estado !== "borrador" && ligaWhatsapp(c) !== null}
									<Button
										href={ligaWhatsapp(c) ?? ""}
										target="_blank"
										size="sm"
										variant="outline"
									>
										<Share2
											size={14}
											aria-hidden="true"
										/>
										Mandar por WhatsApp
									</Button>
								{/if}

								{#if data.puede.surtir && c.estado === "autorizada" && faltaSurtir}
									<form
										method="POST"
										action="?/surtir"
									>
										<input
											type="hidden"
											name="cotizacionId"
											value={c.id}
										/>
										<Button
											size="sm"
											variant="outline"
										>
											<Package
												size={14}
												aria-hidden="true"
											/>
											Surtir del almacén
										</Button>
									</form>
								{/if}
								<!--
									Invoicing is what makes "por cobrar" reachable at all — `avanzarInterno`
									refuses it while there is nothing to collect. Offered only once the
									customer authorised and nothing has been billed for this quote yet.
								-->
								{#if data.puede.facturar && c.estado === "autorizada" && !facturaDe(c.id)}
									<Button
										href={searchHref(page.url, { drawer: "facturar", cot: c.id })}
										size="sm"
										variant="outline"
									>
										<FileText
											size={14}
											aria-hidden="true"
										/>
										Facturar
									</Button>
								{/if}
								{#if data.puede.interno && c.estado === "autorizada"}
									{#each siguientesInternos(c.estadoInterno) as destino (destino)}
										{@const faltaFactura = destino === "por_cobrar" && !facturaDe(c.id)}
										<form
											method="POST"
											action="?/interno"
										>
											<input
												type="hidden"
												name="cotizacionId"
												value={c.id}
											/>
											<input
												type="hidden"
												name="estado"
												value={destino}
											/>
											<!--
												Disabled rather than hidden when the invoice is missing: the step
												exists and the person is looking for it, so the useful answer is
												"emite la factura primero", not an absent button.
											-->
											<Button
												size="sm"
												variant="ghost"
												disabled={faltaFactura}
												title={faltaFactura ? "Emite la factura primero" : undefined}
											>
												Marcar {cotizacionInternoLabel(destino).toLowerCase()}
											</Button>
										</form>
									{/each}
								{/if}
							</div>
						</li>
					{/each}
					{#each data.facturas as f (f.id)}
						<li class="rounded border border-sand-200 p-3">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium text-sand-950">Factura #{f.folio}</span>
								<Badge tone={facturaEstadoTone(f.estado)}>{f.estadoLabel}</Badge>
								<Badge tone={f.condicionPago === "credito" ? "warn" : "neutral"}>
									{condicionPagoLabel(f.condicionPago)}
								</Badge>
								<span class="ml-auto font-medium text-sand-900">{formatoPesos(Number(f.total))}</span>
							</div>

							{#if f.estado !== "cancelada"}
								<p class="mt-1 text-xs text-sand-500">
									Pagado {formatoPesos(Number(f.pagado))}
									{#if !f.liquidada}
										· <strong class="text-accent-700">saldo {formatoPesos(Number(f.saldo))}</strong>
									{/if}
									{#if f.vence}· vence {f.vence.slice(0, 10)}{/if}
								</p>
							{:else if f.canceladoMotivo}
								<p class="mt-1 text-xs text-danger">Cancelada: {f.canceladoMotivo}</p>
							{/if}

							{#if f.pagos.length > 0}
								<ul class="mt-2 space-y-0.5 text-xs text-sand-600">
									{#each f.pagos as p (p.id)}
										<li class="flex flex-wrap gap-1.5">
											<span>{p.pagadoAt.slice(0, 10)} · {p.metodoLabel}</span>
											{#if p.referencia}<span class="text-sand-500">ref. {p.referencia}</span
												>{/if}
											<span class="ml-auto">{formatoPesos(Number(p.monto))}</span>
										</li>
									{/each}
								</ul>
							{/if}

							<div class="mt-2 flex flex-wrap gap-1.5">
								{#if data.puede.cobrar && f.estado !== "cancelada" && !f.liquidada}
									<Button
										href={searchHref(page.url, { drawer: "pagar", fac: f.id })}
										size="sm"
									>
										<Banknote
											size={14}
											aria-hidden="true"
										/>
										Registrar pago
									</Button>
								{/if}
								<!--
									Cancelling is refused once a payment exists — that case is a credit note,
									a different document — so the button goes away instead of 409-ing.
								-->
								{#if data.puede.cancelarFactura && f.estado !== "cancelada" && f.pagos.length === 0}
									<Button
										href={searchHref(page.url, { drawer: "cancelarFactura", fac: f.id })}
										size="sm"
										variant="ghost"
									>
										Cancelar factura
									</Button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
			<p class="mt-3 text-xs text-sand-500">
				Todavía no se timbra ante el SAT: esto registra la cuenta por cobrar, no el CFDI.
			</p>
		</section>
	{/if}

	<!-- Comentarios -->
	<section class="rounded-lg border border-sand-200 bg-white p-5 md:col-span-2">
		<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
			<MessageSquare
				size={18}
				aria-hidden="true"
			/>
			Comentarios
		</h2>
		{#if data.comentarios.length === 0}
			<p class="mt-2 text-sm text-sand-500">Sin comentarios.</p>
		{:else}
			<ul class="mt-3 space-y-2">
				{#each data.comentarios as c (c.id)}
					<li
						class="rounded border border-sand-200 p-2 text-sm {c.interno
							? ''
							: 'border-brand-200 bg-brand-50'}"
					>
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
			<form
				method="POST"
				action="?/comentar"
				class="mt-3 space-y-2"
			>
				<Field
					label="Nuevo comentario"
					name="texto"
				>
					{#snippet children(id)}
						<textarea
							{id}
							name="texto"
							required
							rows="2"
							class={INPUT}
						></textarea>
					{/snippet}
				</Field>
				<label class="flex items-center gap-2 text-sm text-sand-700">
					<input
						type="checkbox"
						name="interno"
						value="1"
						checked
						class="size-4 accent-brand-600"
					/>
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
			<form
				method="POST"
				action="?/avanzar"
			>
				<input
					type="hidden"
					name="estado"
					value={estado}
				/>
				<Button
					variant="outline"
					size="sm">Marcar {notaEstadoLabel(estado).toLowerCase()}</Button
				>
			</form>
		{/each}
	{/if}
	{#if data.puede.entregar && n.estado === "lista"}
		<Button
			href={searchHref(page.url, { drawer: "entregar" })}
			size="sm"
		>
			<PackageCheck
				size={16}
				aria-hidden="true"
			/>
			Entregar unidad
		</Button>
	{/if}
	{#if data.puede.cancelar && n.estado !== "cancelada" && n.estado !== "entregada"}
		<Button
			href={searchHref(page.url, { drawer: "cancelar" })}
			variant="ghost"
			size="sm"
		>
			<Ban
				size={16}
				aria-hidden="true"
			/>
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
		<form
			method="POST"
			action="?/inspeccionar"
			class="space-y-4"
		>
			<!-- Prefilled with whatever is already on file for this unit: the note's own reading if
			     the intake took one, otherwise the unit's last. Retyping a number the system
			     already knows is how a digit gets dropped. -->
			<Field
				label="Kilometraje"
				name="kilometraje"
				type="number"
				min="0"
				value={String(n.kilometraje ?? data.kilometrajeUnidad ?? "")}
				hint={data.kilometrajeUnidad === null
					? "Se guarda también en el historial de la unidad."
					: `Último registrado: ${data.kilometrajeUnidad.toLocaleString("es-MX")} km.`}
			/>
			<label class="flex items-center gap-2 text-sm text-sand-700">
				<input
					type="checkbox"
					name="forzarKilometraje"
					value="1"
					class="size-4 accent-brand-600"
				/>
				Es una corrección (menor al último registrado)
			</label>

			<CombustibleGauge value={n.combustibleOctavos} />

			<Field
				label="Condición de la unidad"
				name="condicion"
			>
				{#snippet children(id)}
					<textarea
						{id}
						name="condicion"
						rows="3"
						class={INPUT}
						placeholder="Rayón en puerta trasera derecha, faro izquierdo estrellado…"
						>{n.condicion ?? ""}</textarea
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
							<input
								type="hidden"
								name="inventarioItem"
								value={item}
							/>
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

			<Field
				label="Observaciones"
				name="observaciones"
			>
				{#snippet children(id)}
					<textarea
						{id}
						name="observaciones"
						rows="2"
						class={INPUT}>{n.observaciones ?? ""}</textarea
					>
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
		<form
			method="POST"
			action="?/transferir"
			class="space-y-4"
		>
			<Field
				label="Taller"
				name="tallerId"
			>
				{#snippet children(id)}
					<select
						{id}
						name="tallerId"
						required
						class={INPUT}
					>
						<option value="">Elige…</option>
						{#each data.talleres as t (t.id)}
							<option
								value={t.id}
								selected={n.tallerActualId === t.id}
							>
								{t.nombre}{t.especialidades ? ` · ${t.especialidades}` : ""}
							</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			{#if data.talleres.length === 0}
				<p class="text-xs text-sand-500">
					No hay talleres dados de alta. <a
						class="underline"
						href="/panel/talleres">Agrégalos aquí</a
					>.
				</p>
			{/if}
			<Field
				label="¿Para qué?"
				name="motivo"
			>
				{#snippet children(id)}
					<textarea
						{id}
						name="motivo"
						required
						rows="2"
						class={INPUT}
						placeholder="Hojalatería y pintura de puerta trasera"
					></textarea>
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
		<form
			method="POST"
			action="?/recibirTaller"
			class="space-y-4"
		>
			<p class="rounded border border-sand-200 bg-sand-50 p-3 text-sm text-sand-700">
				Viene de <strong>{n.tallerActualNombre}</strong>
			</p>

			<fieldset class="rounded border border-sand-200 p-3">
				<legend class="px-1 text-sm font-medium text-sand-700">¿Cómo quedó el trabajo?</legend>
				<div class="space-y-2">
					{#each QA_RESULTADO_KEYS as r (r)}
						<label
							class="flex cursor-pointer items-start gap-2 rounded border border-sand-200 p-2 hover:border-brand-600"
						>
							<input
								type="radio"
								name="qaResultado"
								value={r}
								required
								class="mt-0.5 size-4 shrink-0 accent-brand-600"
								onchange={() => (qaElegido = r)}
							/>
							<span>
								<span class="block text-sm font-medium text-sand-950">{QA_RESULTADOS[r].label}</span>
								<span class="block text-xs text-sand-500">{QA_RESULTADOS[r].descripcion}</span>
							</span>
						</label>
					{/each}
				</div>
			</fieldset>

			{#if mostrarDestino}
				<!--
				Where the unit ends up is a SECOND decision, and only a rejection has two answers —
				anything accepted always comes back, so the server ignores this otherwise.

				`mostrarDestino` is true while unhydrated, because a radio cannot hide anything
				without JavaScript (Rule 7). A no-JS user sees the question and keeps the choice;
				losing it would silently mean `retrabajo`, which is only the default, not the answer.
			-->
				<fieldset class="rounded border border-sand-200 p-3">
					<legend class="px-1 text-sm font-medium text-sand-700">
						{hydrated ? "¿Dónde queda la unidad?" : "Si lo rechazas, ¿dónde queda la unidad?"}
					</legend>
					<div class="space-y-2">
						{#each QA_DESTINO_KEYS as d (d)}
							<label
								class="flex cursor-pointer items-start gap-2 rounded border border-sand-200 p-2 hover:border-brand-600"
							>
								<input
									type="radio"
									name="destino"
									value={d}
									checked={d === "retrabajo"}
									class="mt-0.5 size-4 shrink-0 accent-brand-600"
								/>
								<span>
									<span class="block text-sm font-medium text-sand-950">{QA_DESTINOS[d].label}</span>
									<span class="block text-xs text-sand-500">{QA_DESTINOS[d].descripcion}</span>
								</span>
							</label>
						{/each}
					</div>
				</fieldset>
			{/if}

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

			<Field
				label="Lo que reportó el taller"
				name="resultado"
			>
				{#snippet children(id)}
					<textarea
						{id}
						name="resultado"
						rows="2"
						class={INPUT}
					></textarea>
				{/snippet}
			</Field>

			<Field
				label="Kilometraje al regresar"
				name="kilometraje"
				type="number"
				min="0"
				value={String(data.kilometrajeUnidad ?? n.kilometraje ?? "")}
				hint={data.kilometrajeUnidad === null
					? "Los talleres suelen devolver la unidad con más kilómetros."
					: `Salió con ${data.kilometrajeUnidad.toLocaleString("es-MX")} km. Los talleres suelen devolverla con más.`}
			/>

			<p class="rounded border border-accent-500/40 bg-accent-500/10 px-3 py-2 text-xs text-sand-700">
				El rechazo queda asentado contra ese taller en cualquiera de los dos casos. Lo que
				<strong>nunca</strong> pasa es que la unidad se le entregue al cliente con una reparación mal hecha.
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
		<form
			method="POST"
			action="?/entregar"
			class="space-y-4"
		>
			<Field
				label="¿Quién recibe?"
				name="contactoId"
				hint="Solo contactos con rol de Entregador."
			>
				{#snippet children(id)}
					<select
						{id}
						name="contactoId"
						class={INPUT}
					>
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
					<a
						class="underline"
						href="/panel/clientes/{n.clienteId}">Agrégalos en su ficha</a
					>.
				</p>
			{/if}
			<Field
				label="Observaciones de entrega"
				name="observaciones"
			>
				{#snippet children(id)}
					<textarea
						{id}
						name="observaciones"
						rows="2"
						class={INPUT}>{n.observaciones ?? ""}</textarea
					>
				{/snippet}
			</Field>
			<Button full>Marcar entregada</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "cancelar" && data.puede.cancelar}
	<Drawer
		title="Cancelar nota"
		description="El motivo queda en el expediente."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/cancelar"
			class="space-y-4"
		>
			<Field
				label="Motivo"
				name="motivo"
				required
				hint="Máximo 255 caracteres."
			/>
			<Button full>Cancelar la nota</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "cotizar" && data.puede.cotizar}
	<Drawer
		title="Nueva cotización"
		description="Nace en borrador. Mientras siga ahí se puede corregir; una vez enviada, no."
		closeHref={closeDrawer}
	>
		<!--
			Line items post as PARALLEL ARRAYS — tipo[], descripcion[], cantidad[]… — because that is
			what a plain form can send. The action zips them back into objects. Every row therefore
			has to render all five inputs, always: a select that disappears when the catalogue is
			empty would shift every later row's fields by one.

			Three rows are rendered server-side so the drawer is usable with JavaScript off; the
			"agregar renglón" button is the enhancement, not the mechanism.
		-->
		<form
			method="POST"
			action="?/cotizar"
			class="space-y-4"
		>
			<div class="space-y-3">
				{#each filas as fila, i (i)}
					<fieldset class="rounded border border-sand-200 p-3">
						<legend class="px-1 text-xs font-medium uppercase tracking-wide text-sand-500">
							Renglón {i + 1}
						</legend>

						<label class="block text-xs text-sand-600">
							Del catálogo
							<select
								name="productoId"
								class={INPUT}
								value={fila.productoId}
								onchange={(e) => elegirProducto(i, e.currentTarget.value)}
							>
								<option value="">— línea libre —</option>
								{#each data.productos as p (p.id)}
									<option value={p.id}>
										{p.nombre} · {formatoPesos(Number(p.precioVenta))}{p.controlaInventario
											? ` · ${Number(p.existencia)} ${p.unidad}`
											: ""}
									</option>
								{/each}
							</select>
						</label>

						<label class="mt-2 block text-xs text-sand-600">
							Descripción
							<input
								type="text"
								name="descripcion"
								class={INPUT}
								bind:value={fila.descripcion}
								placeholder={fila.productoId ? "(se toma del catálogo)" : "Ej. Rectificar cabeza"}
							/>
						</label>

						<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
							<label class="block text-xs text-sand-600">
								Tipo
								<select
									name="tipo"
									class={INPUT}
									bind:value={fila.tipo}
								>
									{#each CONCEPTO_TIPO_KEYS as t (t)}
										<option value={t}>{CONCEPTO_TIPOS[t].label}</option>
									{/each}
								</select>
							</label>
							<label class="block text-xs text-sand-600">
								Cantidad
								<input
									type="number"
									name="cantidad"
									step="0.01"
									min="0"
									class={INPUT}
									bind:value={fila.cantidad}
								/>
							</label>
							<label class="col-span-2 block text-xs text-sand-600 sm:col-span-1">
								Precio unitario
								<input
									type="text"
									inputmode="decimal"
									name="precioUnitario"
									placeholder="0.00"
									class={INPUT}
									bind:value={fila.precioUnitario}
								/>
							</label>
						</div>
					</fieldset>
				{/each}
			</div>

			<Button
				type="button"
				variant="ghost"
				size="sm"
				onclick={agregarFila}
			>
				<Plus
					size={16}
					aria-hidden="true"
				/>
				Agregar renglón
			</Button>

			<!--
				Computed with the SAME helpers the server uses (`centavos`, `importeConcepto`,
				`totales`), so the number in front of the counter cannot disagree with the number that
				gets written. IVA on the rounded subtotal, never per line.
			-->
			<dl class="rounded border border-sand-200 bg-sand-50 p-3 text-sm">
				<div class="flex justify-between">
					<dt class="text-sand-600">Subtotal</dt>
					<dd class="text-sand-900">{formatoPesos(previa.subtotal)}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-sand-600">IVA</dt>
					<dd class="text-sand-900">{formatoPesos(previa.iva)}</dd>
				</div>
				<div class="mt-1 flex justify-between border-t border-sand-200 pt-1 font-medium">
					<dt class="text-sand-700">Total</dt>
					<dd class="text-sand-950">{formatoPesos(previa.total)}</dd>
				</div>
			</dl>

			<Field
				label="Vigencia"
				name="vigenciaHasta"
				type="date"
				hint="Opcional. Hasta cuándo respeta el precio."
			/>
			<Field
				label="Notas"
				name="notas"
			>
				{#snippet children(id)}
					<textarea
						{id}
						name="notas"
						rows="2"
						class={INPUT}
					></textarea>
				{/snippet}
			</Field>

			<Button full>Guardar borrador</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "autorizar" && data.puede.cotizar && cotizacionEnFoco}
	<Drawer
		title="El cliente autorizó"
		description="Cotización #{cotizacionEnFoco.folio} · {formatoPesos(Number(cotizacionEnFoco.total))}"
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/estadoCotizacion"
			class="space-y-4"
		>
			<input
				type="hidden"
				name="cotizacionId"
				value={cotizacionEnFoco.id}
			/>
			<input
				type="hidden"
				name="estado"
				value="autorizada"
			/>

			<!--
				An organización cannot approve its own quote — a named person holding `autorizador`
				has to, which is the entire reason that contact role exists. The server refuses
				without one, so say it here rather than letting the submit bounce.
			-->
			<Field
				label="¿Quién autorizó?"
				name="contactoId"
				hint={data.autorizadores.length === 0
					? "Este cliente no tiene contactos con rol de Autorizador. Agrégalo en su ficha."
					: "Contacto del cliente con rol de Autorizador."}
			>
				{#snippet children(id)}
					<select
						{id}
						name="contactoId"
						class={INPUT}
					>
						<option value="">El cliente mismo</option>
						{#each data.autorizadores as a (a.id)}
							<option value={a.id}>{a.nombre}</option>
						{/each}
					</select>
				{/snippet}
			</Field>

			<Field
				label="¿Por dónde?"
				name="medio"
				hint="WhatsApp, por teléfono, firmó en el mostrador…"
			/>

			<Button full>Registrar autorización</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "rechazar" && data.puede.cotizar && cotizacionEnFoco}
	<Drawer
		title="El cliente la rechazó"
		description="Cotización #{cotizacionEnFoco.folio} · {formatoPesos(Number(cotizacionEnFoco.total))}"
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/estadoCotizacion"
			class="space-y-4"
		>
			<input
				type="hidden"
				name="cotizacionId"
				value={cotizacionEnFoco.id}
			/>
			<input
				type="hidden"
				name="estado"
				value="rechazada"
			/>
			<Field
				label="¿Por qué?"
				name="motivo"
				required
				hint="Quedará en el expediente: es lo que explica por qué no se hizo el trabajo."
			/>
			<Button full>Registrar rechazo</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "facturar" && data.puede.facturar && cotizacionEnFoco}
	<Drawer
		title="Emitir factura"
		description="Cotización #{cotizacionEnFoco.folio} · {formatoPesos(Number(cotizacionEnFoco.total))}"
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/facturar"
			class="space-y-4"
		>
			<input
				type="hidden"
				name="cotizacionId"
				value={cotizacionEnFoco.id}
			/>

			<p class="rounded border border-sand-200 bg-sand-50 px-3 py-2 text-xs text-sand-600">
				Los importes salen de la cotización autorizada; no se recapturan. Todavía <strong>no se timbra</strong> ante
				el SAT: esto crea la cuenta por cobrar.
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

			{#if data.credito}
				<p class="text-xs text-sand-600">
					{#if data.credito.limite}
						Crédito: disponible <strong>{formatoPesos(Number(data.credito.disponible))}</strong> de
						{formatoPesos(Number(data.credito.limite))} · {data.credito.diasCredito} días
					{:else}
						Este cliente no tiene línea de crédito: se cobra de contado.
					{/if}
				</p>
			{/if}

			<!--
				Over the limit is a 409 naming the overage, and forcing it is its own audit entry
				(`cliente.credito_override`). Rendered unconditionally so a no-JS user can fill it in
				after the first refusal instead of being stuck; the server ignores it otherwise.
			-->
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

			<Button full>Emitir factura</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "pagar" && data.puede.cobrar && facturaEnFoco}
	<Drawer
		title="Registrar pago"
		description="Factura #{facturaEnFoco.folio} · saldo {formatoPesos(Number(facturaEnFoco.saldo))}"
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/pagar"
			class="space-y-4"
		>
			<input
				type="hidden"
				name="facturaId"
				value={facturaEnFoco.id}
			/>
			<!--
				Prefilled with the balance: paying in full is the common case, and a partial payment is
				a correction away. Overpayment is refused server-side naming the balance.
			-->
			<Field
				label="Monto"
				name="monto"
				required
				value={facturaEnFoco.saldo}
				hint="Máximo {formatoPesos(Number(facturaEnFoco.saldo))}. Pagos parciales sí se aceptan."
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
				hint="Autorización, folio de transferencia, número de cheque…"
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

{#if drawer === "cancelarFactura" && data.puede.cancelarFactura && facturaEnFoco}
	<Drawer
		title="Cancelar factura"
		description="Factura #{facturaEnFoco.folio} · {formatoPesos(Number(facturaEnFoco.total))}"
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/cancelarFactura"
			class="space-y-4"
		>
			<input
				type="hidden"
				name="facturaId"
				value={facturaEnFoco.id}
			/>
			<Field
				label="Motivo"
				name="motivo"
				required
				hint="Máximo 255 caracteres. Una factura con pagos ya no se cancela: eso es una nota de crédito."
			/>
			<Button full>Cancelar la factura</Button>
		</form>
	</Drawer>
{/if}
