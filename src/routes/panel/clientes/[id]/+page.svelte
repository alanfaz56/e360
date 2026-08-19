<script lang="ts">
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import Pencil from "@lucide/svelte/icons/pencil";
	import UserPlus from "@lucide/svelte/icons/user-plus";
	import CarFront from "@lucide/svelte/icons/car-front";
	import Archive from "@lucide/svelte/icons/archive";
	import ArchiveRestore from "@lucide/svelte/icons/archive-restore";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import ShieldCheck from "@lucide/svelte/icons/shield-check";
	import Combine from "@lucide/svelte/icons/combine";
	import Phone from "@lucide/svelte/icons/phone";
	import Star from "@lucide/svelte/icons/star";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import Field from "$lib/components/Field.svelte";
	import EntitySearch, { type Opcion } from "$lib/components/EntitySearch.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import SatSelect from "$lib/components/SatSelect.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { REGIMENES_FISCALES, USOS_CFDI, satLabel } from "$lib/sat-catalogos";
	import { formatoPesos, vencimientoLabel, vencimientoTone } from "$lib/comercial";
	import { notaEstadoTone } from "$lib/notas";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	// factura.com receptor lookup, behind the accordion — fetched once, on first open.
	type ReceptorPac = {
		rfc: string;
		nombre: string;
		regimenFiscal: string;
		codigoPostal: string;
		usoCfdi: string;
		email: string | null;
		calle: string | null;
		numero: string | null;
		colonia: string | null;
		ciudad: string | null;
		estado: string | null;
	};
	let receptorPac = $state<ReceptorPac | null>(null);
	let cargandoReceptor = $state(false);
	let errorReceptor = $state<string | null>(null);
	let receptorCargado = false;
	async function cargarReceptorPac() {
		if (receptorCargado || cargandoReceptor) return;
		cargandoReceptor = true;
		errorReceptor = null;
		try {
			const res = await fetch(`/api/clientes/${data.cliente.id}/facturacion`);
			if (!res.ok) throw new Error("No pudimos consultar factura.com.");
			const body = await res.json();
			receptorPac = body.receptor;
			receptorCargado = true;
		} catch (err) {
			errorReceptor = err instanceof Error ? err.message : "No pudimos consultar factura.com.";
		} finally {
			cargandoReceptor = false;
		}
	}

	const drawer = $derived(page.url.searchParams.get("drawer"));
	const editando = $derived(data.contactos.find((c) => c.id === page.url.searchParams.get("contacto")));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null, contacto: null, duplicado: null }));

	// Two selects drive which fields render. Each is "whatever the user picked, else what the
	// record says" — derived rather than copied into state, so the server-rendered HTML is
	// already correct (no flash of the wrong fields) and a reload after saving is picked up.
	let tipoElegido = $state<"persona" | "organizacion" | null>(null);
	const tipo = $derived(tipoElegido ?? (data.cliente.tipo as "persona" | "organizacion"));

	// Scope selector inside the contact drawer: only show the unit picker when it applies.
	let alcanceElegido = $state<"todas" | "especificas" | null>(null);
	const alcance = $derived(alcanceElegido ?? (editando?.alcanceUnidades as "todas" | "especificas") ?? "todas");

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const activas = $derived(data.unidades.filter((u) => !u.archivado));

	const CAMPO_LABELS: Record<string, string> = {
		nombre: "Nombre",
		apellidos: "Apellidos",
		razonSocial: "Razón social",
		email: "Correo",
		direccion: "Dirección",
		rfc: "RFC",
		regimenFiscal: "Régimen fiscal",
		codigoPostal: "Código postal",
		notas: "Notas",
	};
	// Solo vale la pena preguntar por un campo si el duplicado trae algo Y es distinto de lo que
	// ya tiene el que se conserva — si son iguales o el duplicado no tiene nada, no hay nada que
	// elegir.
	const camposConflicto = $derived(
		data.duplicado
			? data.camposFusionables.filter((campo) => {
					const delDuplicado = (data.duplicado!.cliente as Record<string, unknown>)[campo];
					const delKeeper = (data.cliente as Record<string, unknown>)[campo];
					return delDuplicado && delDuplicado !== delKeeper;
				})
			: [],
	);

	// Búsqueda del duplicado a fusionar — excluye este mismo cliente de los resultados.
	const buscarClientes = async (q: string, signal: AbortSignal): Promise<Opcion[]> => {
		const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&perPage=8`, { signal });
		if (!res.ok) throw new Error("No pudimos buscar clientes.");
		const body = await res.json();
		return (body.clientes ?? [])
			.filter((c: { id: string }) => c.id !== data.cliente.id)
			.map((c: { id: string; nombreCompleto: string; tipoLabel: string; telefono: string | null; rfc: string | null }) => ({
				id: c.id,
				label: c.nombreCompleto,
				hint: c.tipoLabel,
				detalles: [c.telefono, c.rfc],
			}));
	};
</script>

<svelte:head><title>{data.cliente.nombreCompleto} — Estación 360</title></svelte:head>

<a
	href="/panel/clientes"
	class="mb-4 inline-flex items-center gap-1.5 text-sm text-sand-600 hover:text-brand-700"
>
	<ArrowLeft
		size={16}
		aria-hidden="true"
	/>
	Clientes
</a>

<PageHeader
	title={data.cliente.nombreCompleto}
	description={data.cliente.tipoLabel}
>
	{#snippet actions()}
		{#if data.puede.editar}
			<Button
				href={searchHref(page.url, { drawer: "editar" })}
				variant="ghost"
				size="sm"
			>
				<Pencil
					size={16}
					aria-hidden="true"
				/>
				Editar
			</Button>
		{/if}
		{#if data.puede.fusionar}
			<Button
				href={searchHref(page.url, { drawer: "fusionar" })}
				variant="ghost"
				size="sm"
			>
				<Combine
					size={16}
					aria-hidden="true"
				/>
				Fusionar con otro cliente
			</Button>
		{/if}
		{#if data.puede.archivar}
			<form
				method="POST"
				action="?/archivar"
			>
				<input
					type="hidden"
					name="archivado"
					value={data.cliente.archivado ? "false" : "true"}
				/>
				<Button
					variant="ghost"
					size="sm"
				>
					{#if data.cliente.archivado}
						<ArchiveRestore
							size={16}
							aria-hidden="true"
						/>
						Restaurar
					{:else}
						<Archive
							size={16}
							aria-hidden="true"
						/>
						Archivar
					{/if}
				</Button>
			</form>
		{/if}
	{/snippet}
</PageHeader>

{#if data.cliente.archivado}
	<p class="mt-4 rounded border border-sand-300 bg-sand-100 px-3 py-2 text-sm text-sand-700">
		Este cliente está archivado. No se le pueden agregar unidades hasta restaurarlo.
	</p>
{/if}
<Flash {form} />
{#if form?.ok}
	<p
		role="status"
		class="mt-4 rounded border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-sand-800"
	>
		{form.ok}
	</p>
{/if}

<!-- Datos -->
<section class="mt-6 rounded-lg border border-sand-200 bg-white p-5">
	<h2 class="font-display text-lg text-sand-950">Datos</h2>
	<dl class="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
		<div>
			<dt class="text-sand-500">Teléfono</dt>
			<dd class="text-sand-950">{data.cliente.telefono ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Correo</dt>
			<dd class="text-sand-950">{data.cliente.email ?? "—"}</dd>
		</div>
		<div class="sm:col-span-2">
			<dt class="text-sand-500">Dirección</dt>
			<dd class="text-sand-950">{data.cliente.direccion ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">RFC</dt>
			<dd class="text-sand-950">{data.cliente.rfc ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Régimen fiscal</dt>
			<dd class="text-sand-950">{satLabel(REGIMENES_FISCALES, data.cliente.regimenFiscal) ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Código postal</dt>
			<dd class="text-sand-950">{data.cliente.codigoPostal ?? "—"}</dd>
		</div>
		<div>
			<dt class="text-sand-500">Uso CFDI</dt>
			<dd class="text-sand-950">{satLabel(USOS_CFDI, data.cliente.usoCfdi) ?? "—"}</dd>
		</div>
		{#if data.cliente.notas}
			<div class="sm:col-span-2">
				<dt class="text-sand-500">Notas</dt>
				<dd class="text-sand-950">{data.cliente.notas}</dd>
			</div>
		{/if}
		<div class="sm:col-span-2">
			<dt class="text-sand-500">Facturación electrónica</dt>
			<dd class="mt-1 flex flex-wrap items-center gap-2">
				{#if data.cliente.facturaComUid}
					<Badge tone={data.cliente.facturaComEntorno === "produccion" ? "ok" : "warn"}>
						{data.cliente.facturaComEntorno === "produccion" ? "Vinculado" : "Vinculado (sandbox)"}
					</Badge>
					<span class="font-mono text-xs text-sand-500">{data.cliente.facturaComUid}</span>
				{:else}
					<Badge tone="neutral">Sin vincular</Badge>
				{/if}
				{#if data.puede.vincularPac}
					<!-- Same link stamping resolves on its way past — run here on purpose so it can
					     be checked, or a stale link fixed, before an invoice depends on it. -->
					<form
						method="POST"
						action="?/vincularPac"
					>
						<Button
							size="sm"
							variant="outline"
						>
							{data.cliente.facturaComUid ? "Revincular con factura.com" : "Vincular con factura.com"}
						</Button>
					</form>
				{/if}
			</dd>
			{#if data.puede.vincularPac && data.cliente.rfc}
				<!-- Collapsed by default and fetched only on open: this is a lookup on an outside
				     service, not data the page needs to render. Useful when CFDI40145 says the
				     receptor's name doesn't match — this is literally what the PAC has on file. -->
				<details
					class="mt-2"
					ontoggle={(e) => {
						if ((e.currentTarget as HTMLDetailsElement).open) cargarReceptorPac();
					}}
				>
					<summary class="cursor-pointer text-xs text-sand-500 hover:text-brand-700">
						Ver datos en factura.com
					</summary>
					<div class="mt-2 rounded border border-sand-200 bg-sand-50 p-3 text-xs">
						{#if cargandoReceptor}
							<p class="text-sand-500">Consultando factura.com…</p>
						{:else if errorReceptor}
							<p class="text-danger">{errorReceptor}</p>
						{:else if receptorPac}
							<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
								<dt class="text-sand-500">Nombre</dt>
								<dd class="text-sand-900">{receptorPac.nombre || "—"}</dd>
								<dt class="text-sand-500">RFC</dt>
								<dd class="font-mono text-sand-900">{receptorPac.rfc || "—"}</dd>
								<dt class="text-sand-500">Régimen fiscal</dt>
								<dd class="text-sand-900">{receptorPac.regimenFiscal || "—"}</dd>
								<dt class="text-sand-500">Código postal</dt>
								<dd class="text-sand-900">{receptorPac.codigoPostal || "—"}</dd>
								<dt class="text-sand-500">Uso CFDI</dt>
								<dd class="text-sand-900">{receptorPac.usoCfdi || "—"}</dd>
								<dt class="text-sand-500">Correo</dt>
								<dd class="text-sand-900">{receptorPac.email || "—"}</dd>
								<dt class="text-sand-500">Dirección</dt>
								<dd class="text-sand-900">
									{[
										receptorPac.calle,
										receptorPac.numero,
										receptorPac.colonia,
										receptorPac.ciudad,
										receptorPac.estado,
									]
										.filter(Boolean)
										.join(", ") || "—"}
								</dd>
							</dl>
						{:else}
							<p class="text-sand-500">
								Sin receptor registrado en factura.com para este RFC todavía.
							</p>
						{/if}
					</div>
				</details>
			{/if}
		</div>
	</dl>
</section>

<!-- Valor del cliente -->
{#if data.financiero}
	<section class="mt-6 rounded-lg border border-sand-200 bg-white p-5">
		<h2 class="font-display text-lg text-sand-950">Valor del cliente</h2>
		<dl class="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
			<div>
				<dt class="text-sand-500">Facturado histórico</dt>
				<dd class="text-lg font-medium text-sand-950">{formatoPesos(Number(data.financiero.totalFacturado))}</dd>
			</div>
			<div>
				<dt class="text-sand-500">Pagado histórico</dt>
				<dd class="text-lg font-medium text-ok">{formatoPesos(Number(data.financiero.totalPagado))}</dd>
			</div>
			<div>
				<dt class="text-sand-500">Pendiente de cobro</dt>
				<dd
					class="text-lg font-medium"
					class:text-accent-700={Number(data.financiero.pendiente) > 0}
				>
					{formatoPesos(Number(data.financiero.pendiente))}
				</dd>
			</div>
		</dl>

		{#if data.financiero.facturasAbiertas.length > 0}
			<h3 class="mt-5 text-sm font-medium text-sand-700">
				Facturas abiertas ({data.financiero.totalFacturasAbiertas})
			</h3>
			<ul class="mt-2 space-y-1.5 text-sm">
				{#each data.financiero.facturasAbiertas as f (f.id)}
					<li class="flex flex-wrap items-center gap-2 rounded border border-sand-200 px-3 py-2">
						<a
							class="font-medium text-brand-700 hover:underline"
							href="/panel/facturas/{f.id}">Factura #{f.folio}</a
						>
						{#if f.vence}<span class="text-xs text-sand-500">vence {f.vence.slice(0, 10)}</span>{/if}
						{#if vencimientoLabel(f.diasParaVencer)}
							<span
								class="text-xs"
								class:text-danger={vencimientoTone(f.diasParaVencer) === "danger"}
								class:text-accent-700={vencimientoTone(f.diasParaVencer) === "warn"}
								class:text-sand-500={vencimientoTone(f.diasParaVencer) === "neutral"}
							>
								{vencimientoLabel(f.diasParaVencer)}
							</span>
						{/if}
						<span class="ml-auto text-accent-700">saldo {formatoPesos(Number(f.saldo))}</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.financiero.ultimosPagos.length > 0}
			<h3 class="mt-5 text-sm font-medium text-sand-700">Últimos pagos</h3>
			<ul class="mt-2 space-y-1.5 text-sm">
				{#each data.financiero.ultimosPagos as p (p.id)}
					<li class="flex flex-wrap items-center gap-2 rounded border border-sand-200 px-3 py-2">
						<span>{p.pagadoAt.slice(0, 10)} · {p.metodoLabel}</span>
						<span class="text-xs text-sand-500">Factura #{p.facturaFolio}</span>
						<span class="ml-auto font-medium text-sand-900">{formatoPesos(Number(p.monto))}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<!-- Teléfonos -->
<div class="mt-6 flex flex-wrap items-center gap-3">
	<h2 class="font-display text-lg text-sand-950">Teléfonos</h2>
	{#if data.puede.editar}
		<Button
			href={searchHref(page.url, { drawer: "telefono" })}
			variant="ghost"
			size="sm"
			class="ml-auto"
		>
			<Phone
				size={14}
				aria-hidden="true"
			/>
			Agregar teléfono
		</Button>
	{/if}
</div>
{#if data.telefonos.length === 0}
	<p class="mt-2 text-sm text-sand-500">Solo el principal ({data.cliente.telefono ?? "sin capturar"}).</p>
{:else}
	<ul class="mt-2 divide-y divide-sand-100 rounded-lg border border-sand-200 bg-white">
		{#each data.telefonos as t (t.id)}
			<li class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
				<span class="flex items-center gap-2">
					{#if t.principal}
						<Star
							size={14}
							class="fill-brand-500 text-brand-500"
							aria-hidden="true"
						/>
					{/if}
					<span class="text-sand-950">{t.telefono}</span>
					{#if t.etiqueta}<span class="text-xs text-sand-500">{t.etiqueta}</span>{/if}
				</span>
				{#if data.puede.editar}
					<span class="flex items-center gap-2">
						{#if !t.principal}
							<form
								method="POST"
								action="?/marcarPrincipal"
							>
								<input
									type="hidden"
									name="telefonoId"
									value={t.id}
								/>
								<button
									type="submit"
									class="text-xs text-sand-500 hover:text-brand-700"
								>
									Hacer principal
								</button>
							</form>
						{/if}
						<form
							method="POST"
							action="?/eliminarTelefono"
						>
							<input
								type="hidden"
								name="telefonoId"
								value={t.id}
							/>
							<button
								type="submit"
								class="text-xs text-danger hover:underline"
							>
								Eliminar
							</button>
						</form>
					</span>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

{#if drawer === "telefono" && data.puede.editar}
	<Drawer
		title="Agregar teléfono"
		description={data.cliente.nombreCompleto}
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/agregarTelefono"
			class="space-y-4"
		>
			<Field
				label="Teléfono"
				name="telefono"
				type="tel"
				required
			/>
			<Field
				label="Etiqueta"
				name="etiqueta"
				hint="Opcional: casa, WhatsApp, etc."
			/>
			<label class="flex items-start gap-2 text-sm text-sand-800">
				<input
					type="checkbox"
					name="principal"
					class="mt-0.5"
				/>
				Hacer principal
			</label>
			<Button full>Agregar</Button>
		</form>
	</Drawer>
{/if}

<!-- Contactos -->
<div class="mt-10 flex flex-wrap items-center gap-3">
	<h2 class="font-display text-xl text-sand-950">Personas relacionadas</h2>
	{#if data.puede.contactos}
		<Button
			href={searchHref(page.url, { drawer: "contacto" })}
			size="sm"
			class="ml-auto"
		>
			<UserPlus
				size={16}
				aria-hidden="true"
			/>
			Agregar persona
		</Button>
	{/if}
</div>

{#if data.cliente.tipo === "persona"}
	<p class="mt-1 text-sm text-sand-600">
		{data.cliente.nombreCompleto} puede recoger sus propias unidades sin estar en esta lista. Agrega aquí a quien más
		pueda hacerlo.
	</p>
{:else}
	<p class="mt-1 text-sm text-sand-600">
		Una organización no puede firmar por sí misma: registra a las personas autorizadas.
	</p>
{/if}

{#if data.contactos.length === 0}
	<p
		class="mt-3 rounded-lg border border-dashed border-sand-300 bg-white px-4 py-6 text-center text-sm text-sand-600"
	>
		Sin personas registradas.
	</p>
{:else}
	<div class="mt-3">
		<DataTable
			columns={["Nombre", "Roles", "Contacto", "Puede recoger", ""]}
			items={data.contactos}
		>
			{#snippet row(contacto)}
				<td class="px-4 py-2.5 font-medium text-sand-950">
					{contacto.nombre}
					{#if contacto.identificacion}
						<span class="block text-xs font-normal text-sand-500">{contacto.identificacion}</span>
					{/if}
				</td>
				<td class="px-4 py-2.5">
					<div class="flex flex-wrap gap-1">
						{#each contacto.roles as rol (rol)}
							<Badge tone={rol === "entregador" || rol === "autorizador" ? "brand" : "neutral"}>
								{contacto.rolesLabel[contacto.roles.indexOf(rol)]}
							</Badge>
						{:else}
							<span class="text-xs text-sand-400">—</span>
						{/each}
					</div>
				</td>
				<td class="px-4 py-2.5 text-sand-600">{contacto.telefono ?? contacto.email ?? "—"}</td>
				<td class="px-4 py-2.5 text-sand-600">
					{#if !contacto.roles.includes("entregador")}
						<span class="text-sand-400">No autorizado</span>
					{:else if contacto.alcanceUnidades === "todas"}
						Todas las unidades
					{:else}
						{contacto.unidadesAutorizadas.length} unidad(es)
					{/if}
				</td>
				<td class="px-4 py-2.5 text-right">
					{#if data.puede.contactos}
						<div class="flex justify-end gap-1">
							<Button
								href={searchHref(page.url, { drawer: "contacto", contacto: contacto.id })}
								variant="ghost"
								size="sm"
							>
								<Pencil
									size={14}
									aria-hidden="true"
								/>
								Editar
							</Button>
							<form
								method="POST"
								action="?/eliminarContacto"
							>
								<input
									type="hidden"
									name="contactoId"
									value={contacto.id}
								/>
								<Button
									variant="ghost"
									size="sm"
								>
									<Trash2
										size={14}
										aria-hidden="true"
									/>
									Quitar
								</Button>
							</form>
						</div>
					{/if}
				</td>
			{/snippet}
		</DataTable>
	</div>
{/if}

<!-- Historial de servicio -->
{#if data.puede.verNotas}
	<div class="mt-10 flex flex-wrap items-center gap-3">
		<h2 class="font-display text-xl text-sand-950">Historial de servicio</h2>
		<a
			class="ml-auto text-sm text-brand-700 hover:underline"
			href="/panel/notas?clienteId={data.cliente.id}"
		>
			Ver todas
		</a>
	</div>
	{#if data.notasServicio.length > 0}
		<div class="mt-3">
			<DataTable
				columns={["Nota", "Recibida", "Unidad", "Estado"]}
				items={data.notasServicio}
			>
				{#snippet row(n)}
					<td class="px-4 py-2.5">
						<a
							class="font-medium text-brand-700 hover:underline"
							href="/panel/notas/{n.id}">#{n.folio}</a
						>
						{#if n.motivo}<span class="block text-xs text-sand-500">{n.motivo}</span>{/if}
					</td>
					<td class="px-4 py-2.5 text-sand-600">{n.recibidaAt.slice(0, 10)}</td>
					<td class="px-4 py-2.5 text-sand-600">{n.unidadEtiqueta ?? "—"}</td>
					<td class="px-4 py-2.5">
						<Badge tone={notaEstadoTone(n.estado)}>{n.estadoLabel}</Badge>
					</td>
				{/snippet}
			</DataTable>
		</div>
	{:else}
		<p class="mt-3 text-sm text-sand-600">Sin notas de servicio todavía.</p>
	{/if}
{/if}

<!-- Unidades -->
<div class="mt-10 flex flex-wrap items-center gap-3">
	<h2 class="font-display text-xl text-sand-950">Unidades</h2>
	{#if data.puede.crearUnidad && !data.cliente.archivado}
		<Button
			href={searchHref(page.url, { drawer: "unidad" })}
			size="sm"
			class="ml-auto"
		>
			<CarFront
				size={16}
				aria-hidden="true"
			/>
			Registrar unidad
		</Button>
	{/if}
</div>

{#if data.unidades.length === 0}
	<p
		class="mt-3 rounded-lg border border-dashed border-sand-300 bg-white px-4 py-6 text-center text-sm text-sand-600"
	>
		Sin unidades registradas.
	</p>
{:else}
	<div class="mt-3">
		<DataTable
			columns={["Unidad", "Placas", "VIN", "Económico", "Km", ""]}
			items={data.unidades}
		>
			{#snippet row(unidad)}
				<td class="px-4 py-2.5 font-medium text-sand-950">
					{unidad.marca}
					{unidad.modelo}{unidad.anio ? ` ${unidad.anio}` : ""}
					{#if unidad.archivado}
						<span class="ml-2"><Badge tone="neutral">archivada</Badge></span>
					{/if}
				</td>
				<td class="px-4 py-2.5 text-sand-600">{unidad.placas ?? "—"}</td>
				<td class="px-4 py-2.5 font-mono text-xs text-sand-600">{unidad.vin ?? "—"}</td>
				<td class="px-4 py-2.5 text-sand-600">{unidad.numeroEconomico ?? "—"}</td>
				<td class="px-4 py-2.5 text-sand-600">{unidad.kilometraje ?? "—"}</td>
				<td class="px-4 py-2.5 text-right">
					<Button
						href="/panel/unidades/{unidad.id}"
						variant="ghost"
						size="sm">Ver</Button
					>
				</td>
			{/snippet}
		</DataTable>
	</div>
{/if}

<!-- Drawers -->
{#if drawer === "editar" && data.puede.editar}
	<Drawer
		title="Editar cliente"
		description={data.cliente.nombreCompleto}
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/editar"
			class="space-y-4"
		>
			<Field
				label="Tipo"
				name="tipo"
			>
				{#snippet children(id)}
					<select
						{id}
						name="tipo"
						value={tipo}
						onchange={(e) => (tipoElegido = e.currentTarget.value as "persona" | "organizacion")}
						required
						class={INPUT}
					>
						{#each data.tipos as t (t.value)}
							<option value={t.value}>{t.label}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			{#if tipo === "persona"}
				<Field
					label="Nombre"
					name="nombre"
					required
					value={data.cliente.nombre ?? ""}
				/>
				<Field
					label="Apellidos"
					name="apellidos"
					value={data.cliente.apellidos ?? ""}
				/>
			{:else}
				<Field
					label="Razón social"
					name="razonSocial"
					required
					value={data.cliente.razonSocial ?? ""}
				/>
			{/if}
			<Field
				label="Teléfono"
				name="telefono"
				type="tel"
				value={data.cliente.telefono ?? ""}
			/>
			<Field
				label="Correo"
				name="email"
				type="email"
				value={data.cliente.email ?? ""}
			/>
			<Field
				label="Dirección"
				name="direccion"
				value={data.cliente.direccion ?? ""}
			/>
			<Field
				label="RFC"
				name="rfc"
				value={data.cliente.rfc ?? ""}
			/>
			<SatSelect
				label="Régimen fiscal"
				name="regimenFiscal"
				catalogo={REGIMENES_FISCALES}
				{tipo}
				value={data.cliente.regimenFiscal}
			/>
			<Field
				label="Código postal"
				name="codigoPostal"
				value={data.cliente.codigoPostal ?? ""}
			/>
			<SatSelect
				label="Uso CFDI"
				name="usoCfdi"
				catalogo={USOS_CFDI}
				{tipo}
				value={data.cliente.usoCfdi}
			/>
			<Field
				label="Notas"
				name="notas"
				value={data.cliente.notas ?? ""}
			/>
			<Button full>Guardar</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "contacto" && data.puede.contactos}
	<Drawer
		title={editando ? "Editar persona" : "Agregar persona"}
		description={data.cliente.nombreCompleto}
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action={editando ? "?/editarContacto" : "?/crearContacto"}
			class="space-y-4"
		>
			{#if editando}
				<input
					type="hidden"
					name="contactoId"
					value={editando.id}
				/>
			{/if}

			<Field
				label="Nombre"
				name="nombre"
				required
				value={editando?.nombre ?? ""}
			/>
			<Field
				label="Teléfono"
				name="telefono"
				type="tel"
				value={editando?.telefono ?? ""}
			/>
			<Field
				label="Correo"
				name="email"
				type="email"
				value={editando?.email ?? ""}
			/>
			<Field
				label="Identificación"
				name="identificacion"
				value={editando?.identificacion ?? ""}
				hint="Para verificarla en el mostrador. Ej. INE 1234. No guardes fotos de documentos."
			/>

			<fieldset>
				<legend class="text-sm font-medium text-sand-700">Roles</legend>
				<div class="mt-2 space-y-2">
					{#each data.rolesDisponibles as rol (rol.value)}
						<label class="flex items-start gap-2.5 text-sm">
							<input
								type="checkbox"
								name="roles"
								value={rol.value}
								checked={editando?.roles.includes(rol.value)}
								class="mt-0.5 size-4 shrink-0 rounded border-sand-300 accent-brand-600"
							/>
							<span>
								<span class="font-medium text-sand-950">{rol.label}</span>
								{#if rol.autoridad}
									<ShieldCheck
										size={13}
										class="ml-1 inline text-brand-600"
										aria-label="Rol con autoridad"
									/>
								{/if}
								<span class="block text-xs text-sand-500">{rol.descripcion}</span>
							</span>
						</label>
					{/each}
				</div>
				{#if !data.puede.otorgarAutoridad}
					<p
						class="mt-2 rounded border border-accent-500/60 bg-accent-500/15 px-3 py-2 text-xs text-sand-800"
					>
						Solo un Gerente o Admin puede marcar a alguien como <strong>Entregador</strong> o
						<strong>Autorizador</strong>, porque esos roles permiten llevarse una unidad o autorizar gastos.
					</p>
				{/if}
			</fieldset>

			<Field
				label="Puede recoger"
				name="alcanceUnidades"
			>
				{#snippet children(id)}
					<select
						{id}
						name="alcanceUnidades"
						value={alcance}
						onchange={(e) => (alcanceElegido = e.currentTarget.value as "todas" | "especificas")}
						class={INPUT}
					>
						<option value="todas">Todas las unidades del cliente</option>
						<option value="especificas">Solo unidades específicas</option>
					</select>
				{/snippet}
			</Field>

			{#if alcance === "especificas"}
				<fieldset>
					<legend class="text-sm font-medium text-sand-700">Unidades autorizadas</legend>
					{#if activas.length === 0}
						<p class="mt-1 text-xs text-sand-500">Este cliente todavía no tiene unidades.</p>
					{:else}
						<div class="mt-2 space-y-1.5">
							{#each activas as unidad (unidad.id)}
								<label class="flex items-center gap-2.5 text-sm text-sand-800">
									<input
										type="checkbox"
										name="unidades"
										value={unidad.id}
										checked={editando?.unidadesAutorizadas.includes(unidad.id)}
										class="size-4 rounded border-sand-300 accent-brand-600"
									/>
									{unidad.etiqueta}
								</label>
							{/each}
						</div>
					{/if}
				</fieldset>
			{/if}

			<Field
				label="Notas"
				name="notas"
				value={editando?.notas ?? ""}
			/>
			<Button full>{editando ? "Guardar" : "Agregar persona"}</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "unidad" && data.puede.crearUnidad}
	<Drawer
		title="Registrar unidad"
		description="Solo marca y modelo son obligatorios."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/crearUnidad"
			class="space-y-4"
		>
			<Field
				label="Marca"
				name="marca"
				required
			/>
			<Field
				label="Modelo"
				name="modelo"
				required
			/>
			<Field
				label="Año"
				name="anio"
				type="number"
			/>
			<Field
				label="Color"
				name="color"
			/>
			<Field
				label="Placas"
				name="placas"
			/>
			<Field
				label="VIN / NIV"
				name="vin"
				hint="Único en todo el sistema cuando se captura."
			/>
			<Field
				label="Número económico"
				name="numeroEconomico"
				hint="El número que la flotilla pinta en la puerta."
			/>
			<Field
				label="Kilometraje"
				name="kilometraje"
				type="number"
			/>
			<Field
				label="Notas"
				name="notas"
			/>
			<Button full>Registrar unidad</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "fusionar" && data.puede.fusionar}
	<Drawer
		title="Fusionar con otro cliente"
		description={data.cliente.nombreCompleto}
		closeHref={closeDrawer}
	>
		{#if !data.duplicado}
			<!-- Paso 1: elegir el duplicado. Form GET: sin JS navega igual a ?duplicado=<id>. -->
			<form
				method="GET"
				class="space-y-4"
			>
				<input
					type="hidden"
					name="drawer"
					value="fusionar"
				/>
				<EntitySearch
					label="Cliente duplicado"
					name="duplicado"
					hint="Todo lo que le pertenece pasará a {data.cliente.nombreCompleto}. Se archiva, no se borra."
					opciones={data.posiblesDuplicados.map((c) => ({
						id: c.id,
						label: c.nombreCompleto,
						hint: c.tipoLabel,
						detalles: [c.telefono, c.rfc],
					}))}
					buscar={buscarClientes}
					required
				/>
				{#if data.posiblesDuplicados.length > 0}
					<p class="text-xs text-sand-500">
						Posibles duplicados por teléfono o nombre: {data.posiblesDuplicados
							.map((c) => c.nombreCompleto)
							.join(", ")}.
					</p>
				{/if}
				<Button full>Continuar</Button>
			</form>
		{:else}
			<!-- Paso 2: confirmar y elegir qué contactos del duplicado sobreviven. -->
			<form
				method="POST"
				action="?/fusionar"
				class="space-y-4"
			>
				<input
					type="hidden"
					name="duplicadoId"
					value={data.duplicado.cliente.id}
				/>
				<p class="rounded border border-danger/30 bg-danger/5 p-3 text-sm text-sand-800">
					<strong>{data.duplicado.cliente.nombreCompleto}</strong> se archivará. Sus unidades, citas, notas
					y facturas pasan a <strong>{data.cliente.nombreCompleto}</strong>.
				</p>

				{#if camposConflicto.length > 0}
					<fieldset class="rounded border border-sand-200 p-3">
						<legend class="px-1 text-sm font-medium text-sand-700">Qué dato usar</legend>
						{#each camposConflicto as campo (campo)}
							{@const delKeeper = (data.cliente as Record<string, unknown>)[campo] as string | null}
							{@const delDuplicado = (data.duplicado.cliente as Record<string, unknown>)[campo] as string | null}
							<div class="mt-2">
								<p class="text-xs font-medium text-sand-600">{CAMPO_LABELS[campo]}</p>
								<label class="mt-1 flex items-start gap-2 text-sm text-sand-800">
									<input
										type="radio"
										name="campo_{campo}"
										value="keeper"
										checked
										class="mt-0.5"
									/>
									{delKeeper ?? "(vacío)"}
								</label>
								<label class="mt-1 flex items-start gap-2 text-sm text-sand-800">
									<input
										type="radio"
										name="campo_{campo}"
										value="duplicado"
										class="mt-0.5"
									/>
									{delDuplicado} <span class="text-xs text-sand-500">(del duplicado)</span>
								</label>
							</div>
						{/each}
					</fieldset>
				{/if}

				{#if data.duplicado.telefonos.length > 0}
					<fieldset class="rounded border border-sand-200 p-3">
						<legend class="px-1 text-sm font-medium text-sand-700">
							Teléfonos de {data.duplicado.cliente.nombreCompleto} a conservar
						</legend>
						<p class="text-xs text-sand-500">Los que no marques se archivan junto con el cliente.</p>
						{#each data.duplicado.telefonos as t (t.id)}
							<label class="mt-2 flex items-start gap-2 text-sm text-sand-800">
								<input
									type="checkbox"
									name="telefonosAConservar"
									value={t.id}
									class="mt-0.5"
								/>
								<span>
									{t.telefono}
									{#if t.etiqueta}<span class="text-xs text-sand-500">{t.etiqueta}</span>{/if}
								</span>
							</label>
						{/each}
					</fieldset>
				{/if}

				{#if data.duplicado.contactos.length > 0}
					<fieldset class="rounded border border-sand-200 p-3">
						<legend class="px-1 text-sm font-medium text-sand-700">
							Contactos de {data.duplicado.cliente.nombreCompleto} a conservar
						</legend>
						<p class="text-xs text-sand-500">Los que no marques se archivan junto con el cliente.</p>
						{#each data.duplicado.contactos as ct (ct.id)}
							<label class="mt-2 flex items-start gap-2 text-sm text-sand-800">
								<input
									type="checkbox"
									name="contactosAConservar"
									value={ct.id}
									class="mt-0.5"
								/>
								<span>
									<span class="font-medium">{ct.nombre}</span>
									<span class="block text-xs text-sand-500">{ct.rolesLabel.join(", ")}</span>
								</span>
							</label>
						{/each}
					</fieldset>
				{/if}

				<label class="flex items-start gap-2 text-sm text-sand-800">
					<input
						type="checkbox"
						name="crearContactoDelDuplicado"
						class="mt-0.5"
					/>
					<span>
						Convertir a <strong>{data.duplicado.cliente.nombreCompleto}</strong> en contacto de
						{data.cliente.nombreCompleto}
						<span class="block text-xs text-sand-500">
							Sin autoridad — solo un teléfono de contacto, para no perder quién era.
						</span>
					</span>
				</label>

				<Field
					label="Motivo"
					name="motivo"
					required
					hint="Por qué son el mismo cliente."
				/>

				<Button full>Fusionar y archivar a {data.duplicado.cliente.nombreCompleto}</Button>
				<Button
					href={searchHref(page.url, { duplicado: null })}
					variant="ghost"
					full
				>
					Elegir otro
				</Button>
			</form>
		{/if}
	</Drawer>
{/if}
