<script lang="ts">
	import Package from "@lucide/svelte/icons/package";
	import Plus from "@lucide/svelte/icons/plus";
	import Search from "@lucide/svelte/icons/search";
	import Archive from "@lucide/svelte/icons/archive";
	import ArchiveRestore from "@lucide/svelte/icons/archive-restore";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Layers from "@lucide/svelte/icons/layers";
	import TruckIcon from "@lucide/svelte/icons/truck";
	import Scale from "@lucide/svelte/icons/scale";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import StatCard from "$lib/components/StatCard.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import {
		CONCEPTO_TIPOS,
		CONCEPTO_TIPO_KEYS,
		centavos,
		conceptoTipoLabel,
		formatoPesos,
		margenPorcentaje,
	} from "$lib/comercial";
	import { estadoExistencia, solicitudEstadoTone } from "$lib/inventario";
	import { CLAVES_PROD_SERV, CLAVES_UNIDAD, CLAVE_PROD_SERV_DEFAULT } from "$lib/sat-catalogos";
	import { haceCuanto } from "$lib/notificaciones";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const drawer = $derived(page.url.searchParams.get("drawer"));
	const editando = $derived(data.productos.find((p) => p.id === page.url.searchParams.get("producto")));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null, producto: null }));

	// The goods-receipt form grows rows client-side; with JS off it still ships three.
	let renglones = $state(3);

	// Recipe rows for the product drawer. Seeded from whatever the row being edited already has,
	// plus one blank — same "grow client-side, three with JS off" idea as the goods-receipt rows.
	let recetaFilas = $state(1);
	$effect(() => {
		drawer;
		editando;
		recetaFilas = Math.max(data.receta?.length ?? 0, 1);
	});
	const componentesDisponibles = $derived(data.productos.filter((p) => p.controlaInventario && p.id !== editando?.id));

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const conStock = $derived(data.productos.filter((p) => p.controlaInventario));

	// Live "what the customer pays" for the product drawer. Seeded from the row being edited so the
	// figure is right on first paint, before anybody types — and reset when the drawer changes.
	let precioCrudo = $state("");
	let ivaCrudo = $state("");
	$effect(() => {
		// Reading these makes the effect re-run when the drawer opens or switches product.
		drawer;
		editando;
		precioCrudo = editando?.precioVenta ?? "0.00";
		ivaCrudo = editando?.ivaTasa ?? "0.16";
	});

	const conIva = $derived.by(() => {
		const base = centavos(precioCrudo);
		const tasa = Number(ivaCrudo);
		if (base === null || base === 0n || !Number.isFinite(tasa) || tasa < 0) return null;
		const iva = BigInt(Math.round(Number(base) * tasa));
		return { base, iva, total: base + iva };
	});
</script>

<svelte:head><title>Inventario — Estación 360</title></svelte:head>

<PageHeader
	title="Inventario"
	description="El catálogo que se cotiza y lo que hay en el almacén."
>
	{#snippet actions()}
		{#if data.puede.entrada}
			<Button
				href={searchHref(page.url, { drawer: "entrada" })}
				variant="outline"
			>
				<TruckIcon
					size={18}
					aria-hidden="true"
				/>
				Recibir mercancía
			</Button>
		{/if}
		{#if data.puede.entrada && data.puede.gestionar}
			<Button
				href="/panel/inventario/comprar-cfdi"
				variant="outline"
			>
				<TruckIcon
					size={18}
					aria-hidden="true"
				/>
				Importar CFDI
			</Button>
		{/if}
		{#if data.puede.gestionar}
			<Button href={searchHref(page.url, { drawer: "nuevo" })}>
				<Plus
					size={18}
					aria-hidden="true"
				/>
				Nuevo producto
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<Flash {form} />

<!-- Mobile first: one column on a phone, three from sm. -->
<div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
	<StatCard
		label="Productos"
		value={data.total}
		icon="package"
	/>
	{#if data.valorInventario}
		<StatCard
			label="Valor del almacén"
			value={formatoPesos(data.valorInventario.valor)}
			hint="{data.valorInventario.capas} capa(s) abiertas"
		/>
	{/if}
	{#if data.puede.salida}
		<StatCard
			label="Refacciones pedidas"
			value={data.pendientes.length}
			hint={data.pendientes.length > 0 ? "Mecánicos esperando" : "Nada pendiente"}
			tone={data.pendientes.length > 0 ? "warn" : "ok"}
			href={searchHref(page.url, { drawer: "solicitudes" })}
		/>
	{/if}
</div>

{#if data.puede.salida && data.pendientes.length > 0}
	<p
		class="mt-4 flex flex-wrap items-center gap-2 rounded border border-accent-500 bg-accent-500/15 px-3 py-2 text-sm text-sand-900"
	>
		{data.pendientes.length} refacción(es) pedidas por mecánicos.
		<a
			class="font-bold underline"
			href={searchHref(page.url, { drawer: "solicitudes" })}>Atenderlas</a
		>
	</p>
{/if}

<form
	method="GET"
	class="mb-4 mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-sand-200 bg-white p-4"
>
	<div class="min-w-48 flex-1">
		<Field
			label="Buscar"
			name="q"
			value={data.filtros.q}
			placeholder="Nombre, SKU, descripción…"
		/>
	</div>
	<Field
		label="Tipo"
		name="tipo"
	>
		{#snippet children(id)}
			<select
				{id}
				name="tipo"
				class={INPUT}
			>
				<option value="">Todos</option>
				{#each CONCEPTO_TIPO_KEYS as t (t)}
					<option
						value={t}
						selected={data.filtros.tipo === t}>{CONCEPTO_TIPOS[t].label}</option
					>
				{/each}
			</select>
		{/snippet}
	</Field>
	{#if data.filtros.bajos}<input
			type="hidden"
			name="bajos"
			value="1"
		/>{/if}
	<Button size="sm">
		<Search
			size={16}
			aria-hidden="true"
		/>
		Buscar
	</Button>
	<Button
		href={searchHref(page.url, { bajos: data.filtros.bajos ? null : "1", page: null })}
		variant={data.filtros.bajos ? "primary" : "ghost"}
		size="sm"
	>
		Hay que comprar
	</Button>
	<Button
		href={searchHref(page.url, { archivados: data.filtros.archivados ? null : "1", page: null })}
		variant={data.filtros.archivados ? "primary" : "ghost"}
		size="sm"
	>
		Archivados
	</Button>
</form>

{#if data.productos.length === 0}
	<EmptyState
		title={data.filtros.bajos ? "Nada bajo mínimo" : "Todavía no hay productos"}
		description="Da de alta refacciones, mano de obra e insumos para poder cotizarlos y llevar existencias."
	>
		{#snippet icon()}<Package
				size={40}
				aria-hidden="true"
			/>{/snippet}
	</EmptyState>
{:else}
	<DataTable
		columns={["Producto", "SAT", "Precio", ...(data.puede.verCosto ? ["Margen"] : []), "Existencia", ""]}
		items={data.productos}
	>
		{#snippet row(p)}
			{@const est = estadoExistencia(Number(p.existencia), p.minimo === null ? null : Number(p.minimo))}
			<td class="px-4 py-2.5">
				<span class="block font-medium text-sand-950">{p.nombre}</span>
				<span class="mt-0.5 flex flex-wrap items-center gap-1">
					<Badge tone="neutral">{conceptoTipoLabel(p.tipo)}</Badge>
					{#if p.sku}<span class="font-mono text-xs text-sand-500">{p.sku}</span>{/if}
					{#if p.archivado}<Badge tone="neutral">Archivado</Badge>{/if}
				</span>
			</td>
			<td class="px-4 py-2.5">
				<span class="block font-mono text-xs text-sand-700">{p.claveProdServ}</span>
				<span class="block text-xs text-sand-500">{p.claveUnidad} · {p.unidad}</span>
			</td>
			<!-- `formatoPesos` already carries the currency symbol; a literal `$` here made it "$$". -->
			<td class="px-4 py-2.5 text-sand-900">{formatoPesos(p.precioVenta)}</td>
			{#if data.puede.verCosto}
				{@const costo = data.costos?.[p.id]}
				{@const margen = costo ? margenPorcentaje(centavos(p.precioVenta) ?? 0n, centavos(costo) ?? 0n) : null}
				<!-- Margin, not markup: (venta - costo) / venta. Admin-only, same as the costo field itself. -->
				<td class="px-4 py-2.5 tabular-nums {margen != null && margen < 0 ? 'text-danger' : 'text-sand-700'}">
					{margen != null ? `${margen}%` : "—"}
				</td>
			{/if}
			<td class="px-4 py-2.5">
				{#if p.controlaInventario}
					<span class="block text-sand-900">{Number(p.existencia).toLocaleString("es-MX")} {p.unidad}</span>
					<Badge tone={est.tone}>{est.label}</Badge>
				{:else}
					<span class="text-xs text-sand-500">No aplica</span>
				{/if}
			</td>
			<td class="px-4 py-2.5 text-right">
				<span class="flex flex-wrap justify-end gap-1">
					{#if p.controlaInventario}
						<Button
							href={searchHref(page.url, { drawer: "existencia", producto: p.id })}
							variant="ghost"
							size="sm"
						>
							<Layers
								size={15}
								aria-hidden="true"
							/>
							Capas
						</Button>
						{#if data.puede.entrada}
							<Button
								href={searchHref(page.url, { drawer: "comprar", producto: p.id })}
								variant="ghost"
								size="sm"
							>
								<Plus
									size={15}
									aria-hidden="true"
								/>
								Comprar
							</Button>
						{/if}
					{/if}
					{#if data.puede.gestionar}
						<Button
							href={searchHref(page.url, { drawer: "editar", producto: p.id })}
							variant="ghost"
							size="sm"
						>
							<Pencil
								size={15}
								aria-hidden="true"
							/>
							Editar
						</Button>
						<form
							method="POST"
							action="?/archivar"
						>
							<input
								type="hidden"
								name="id"
								value={p.id}
							/>
							<input
								type="hidden"
								name="archivado"
								value={p.archivado ? "0" : "1"}
							/>
							<Button
								variant="ghost"
								size="sm"
							>
								{#if p.archivado}
									<ArchiveRestore
										size={15}
										aria-hidden="true"
									/>
								{:else}
									<Archive
										size={15}
										aria-hidden="true"
									/>
								{/if}
							</Button>
						</form>
					{/if}
				</span>
			</td>
		{/snippet}
	</DataTable>
{/if}

{#if (drawer === "nuevo" || drawer === "editar") && data.puede.gestionar}
	{@const p = drawer === "editar" ? editando : null}
	<Drawer
		title={p ? "Editar producto" : "Nuevo producto"}
		description="Las claves del SAT se guardan desde ahora, aunque todavía no se timbre."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action={p ? "?/editar" : "?/crear"}
			class="space-y-4"
		>
			{#if p}<input
					type="hidden"
					name="id"
					value={p.id}
				/>{/if}

			<Field
				label="Nombre"
				name="nombre"
				required
				value={p?.nombre ?? ""}
			/>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field
					label="SKU (opcional)"
					name="sku"
					value={p?.sku ?? ""}
				/>
				<Field
					label="Tipo"
					name="tipo"
				>
					{#snippet children(id)}
						<select
							{id}
							name="tipo"
							required
							class={INPUT}
						>
							{#each CONCEPTO_TIPO_KEYS as t (t)}
								<option
									value={t}
									selected={(p?.tipo ?? "refaccion") === t}>{CONCEPTO_TIPOS[t].label}</option
								>
							{/each}
						</select>
					{/snippet}
				</Field>
			</div>
			<Field
				label="Descripción"
				name="descripcion"
				value={p?.descripcion ?? ""}
			/>

			<fieldset class="rounded border border-sand-200 p-3">
				<legend class="px-1 text-xs font-medium text-sand-500">Claves del SAT</legend>
				<Field
					label="ClaveProdServ"
					name="claveProdServ"
					hint="8 dígitos. Si no está en la lista, escríbela."
				>
					{#snippet children(id)}
						<input
							{id}
							name="claveProdServ"
							list="claves-prodserv"
							pattern="[0-9]{'{'}8{'}'}"
							class={INPUT}
							value={p?.claveProdServ ?? CLAVE_PROD_SERV_DEFAULT.refaccion}
						/>
					{/snippet}
				</Field>
				<datalist id="claves-prodserv">
					{#each CLAVES_PROD_SERV as c (c.clave)}
						<option value={c.clave}>{c.descripcion}</option>
					{/each}
				</datalist>

				<div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field
						label="ClaveUnidad"
						name="claveUnidad"
					>
						{#snippet children(id)}
							<select
								{id}
								name="claveUnidad"
								class={INPUT}
							>
								{#each CLAVES_UNIDAD as u (u.clave)}
									<option
										value={u.clave}
										selected={(p?.claveUnidad ?? "H87") === u.clave}
									>
										{u.clave} · {u.descripcion}
									</option>
								{/each}
							</select>
						{/snippet}
					</Field>
					<Field
						label="Unidad (como se lee)"
						name="unidad"
						value={p?.unidad ?? "Pieza"}
					/>
				</div>
			</fieldset>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field
					label="Precio de venta"
					name="precioVenta"
					value={p?.precioVenta ?? "0.00"}
					required
					hint="Sin IVA. Es el precio que va al renglón de la cotización."
					oninput={(e: Event) => (precioCrudo = (e.currentTarget as HTMLInputElement).value)}
				/>
				<Field
					label="Tasa de IVA"
					name="ivaTasa"
					value={p?.ivaTasa ?? "0.16"}
					hint="0.16 = 16%"
					oninput={(e: Event) => (ivaCrudo = (e.currentTarget as HTMLInputElement).value)}
				/>
			</div>

			<!--
				What the customer will actually be quoted. The field above is the price WITHOUT IVA —
				which is right, because that is what goes on the line and what the totals are computed
				from — but somebody pricing a part is thinking of the number the customer hears.

				Computed with `centavos`, the same parser the server uses, so an amount it would reject
				shows nothing here instead of a confident wrong figure.
			-->
			{#if conIva}
				<p class="-mt-2 rounded border border-sand-200 bg-sand-50 px-3 py-2 text-sm text-sand-700">
					Con IVA se cobra <strong class="text-sand-950">{formatoPesos(conIva.total)}</strong>
					<span class="text-xs text-sand-500">
						· {formatoPesos(conIva.base)} + {formatoPesos(conIva.iva)} de IVA
					</span>
				</p>
			{/if}

			<!--
				Admin-only: producto:costo is narrower than producto:manage, so a Gerente sees this
				whole form except this field. The server ignores it silently if it ever arrives from
				someone who shouldn't be sending it — see `leerProductoInput` in server/productos.ts.
			-->
			{#if data.puede.verCosto}
				<Field
					label="Costo de referencia"
					name="costoReferencia"
					value={p ? (data.costos?.[p.id] ?? "") : ""}
					hint="Opcional. Para partes/servicios sin capas de inventario, o como referencia manual. Nunca se muestra fuera de este formulario."
				/>
			{/if}

			<label class="flex cursor-pointer items-center gap-2 py-1.5 text-sm text-sand-700">
				<input
					type="checkbox"
					name="controlaInventario"
					checked={p?.controlaInventario ?? true}
					class="size-4 accent-brand-600"
				/>
				Lleva existencias
			</label>
			<p class="-mt-2 text-xs text-sand-500">
				La mano de obra no se acaba, así que no lleva inventario aunque lo marques.
			</p>

			<Field
				label="Mínimo para avisar"
				name="minimo"
				value={p?.minimo ?? ""}
				hint="Opcional."
			/>

			{#if !p}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field
						label="Existencia inicial"
						name="existenciaInicial"
						type="number"
						step="0.001"
						min="0"
						hint="Opcional. Abre una capa real, como una entrada."
					/>
					<Field
						label="Costo inicial"
						name="costoInicial"
						hint="Requerido si pones existencia inicial."
					/>
				</div>
			{/if}

			{#if data.puede.negativo}
				<label class="flex cursor-pointer items-center gap-2 py-1.5 text-sm text-sand-700">
					<input
						type="checkbox"
						name="permiteNegativo"
						checked={p?.permiteNegativo ?? false}
						class="size-4 accent-brand-600"
					/>
					Permitir existencia negativa
				</label>
				<p class="-mt-2 text-xs text-sand-500">
					Deja surtir aunque no alcance — útil para componentes de receta que se agotan a medio
					día. Solo Admin puede activarlo.
				</p>
			{/if}

			<fieldset class="rounded border border-sand-200 p-3">
				<legend class="px-1 text-xs font-medium text-sand-500">Componentes (receta)</legend>
				<p class="mb-2 text-xs text-sand-500">
					Si agregas componentes, este producto se vuelve un paquete: deja de llevar su propia
					existencia y, al surtirse, consume estos componentes en su lugar.
				</p>
				{#each Array(recetaFilas) as _, i (i)}
					{@const fila = data.receta?.[i]}
					<div class="mt-2 grid grid-cols-[1fr_auto] gap-2 first:mt-0">
						<select
							name="componenteProductoId"
							class={INPUT}
						>
							<option value="">—</option>
							{#each componentesDisponibles as c (c.id)}
								<option
									value={c.id}
									selected={fila?.componenteId === c.id}>{c.nombre}{c.sku ? ` · ${c.sku}` : ""}</option
								>
							{/each}
						</select>
						<input
							name="componenteCantidad"
							type="number"
							step="0.001"
							min="0"
							placeholder="Cant."
							value={fila?.cantidad ?? ""}
							class="{INPUT} w-24"
						/>
					</div>
				{/each}
				<div class="mt-2">
					<Button
						type="button"
						onclick={() => (recetaFilas += 1)}
						variant="ghost"
						size="sm"
					>
						<Plus
							size={15}
							aria-hidden="true"
						/>
						Otro componente
					</Button>
				</div>
			</fieldset>

			<Button full>{p ? "Guardar" : "Dar de alta"}</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "existencia" && editando}
	<Drawer
		title="Capas de {editando.nombre}"
		description="FIFO: se consume de arriba hacia abajo."
		closeHref={closeDrawer}
	>
		{#if data.capas.length === 0}
			<p class="text-sm text-sand-500">Sin existencia. No hay capas abiertas.</p>
		{:else}
			<ul class="space-y-2">
				{#each data.capas as c, i (c.id)}
					<li class="rounded border p-3 {i === 0 ? 'border-brand-300 bg-brand-50/50' : 'border-sand-200'}">
						<p class="flex flex-wrap items-center gap-2 text-sm">
							<span class="font-medium text-sand-950"
								>{Number(c.restante).toLocaleString("es-MX")} {editando.unidad}</span
							>
							<span class="text-sand-600">a {formatoPesos(c.costoUnitario)}</span>
							{#if i === 0}<Badge tone="brand">Sale primero</Badge>{/if}
						</p>
						<p class="mt-0.5 text-xs text-sand-500">
							De {Number(c.cantidad).toLocaleString("es-MX")} · {haceCuanto(c.recibidaAt)}
							{#if c.entradaFolio}· entrada #{c.entradaFolio}{/if}
							{#if c.proveedor}· {c.proveedor}{/if}
							{#if c.conCfdi}· con CFDI{/if}
						</p>
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.puede.ajuste}
			<form
				method="POST"
				action="?/ajustar"
				class="mt-6 space-y-3 border-t border-sand-200 pt-5"
			>
				<h3 class="font-display flex items-center gap-2 text-base text-sand-950">
					<Scale
						size={16}
						aria-hidden="true"
					/>
					Ajustar por conteo físico
				</h3>
				<input
					type="hidden"
					name="productoId"
					value={editando.id}
				/>
				<Field
					label="Existencia real contada"
					name="nueva"
					required
					value={editando.existencia}
				/>
				<Field
					label="Motivo"
					name="motivo"
					required
					hint="Obligatorio. Queda en la auditoría."
				/>
				<Field
					label="Costo unitario (si sube)"
					name="costoUnitario"
					hint="Por omisión, el de la última capa."
				/>
				<Button
					variant="outline"
					full>Ajustar</Button
				>
			</form>
		{/if}
	</Drawer>
{/if}

{#if drawer === "comprar" && editando && data.puede.entrada}
	<Drawer
		title="Comprar {editando.nombre}"
		description="Una línea, sin proveedor ni CFDI — para cuando sólo hay que reponer una cosa."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/comprarRapido"
			class="space-y-4"
		>
			<input
				type="hidden"
				name="productoId"
				value={editando.id}
			/>
			<Field
				label="Cantidad"
				name="cantidad"
				type="number"
				step="0.001"
				min="0"
				required
			/>
			<Field
				label="Costo unitario"
				name="costoUnitario"
				required
			/>
			<Button full>Comprar</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "entrada" && data.puede.entrada}
	<Drawer
		title="Recibir mercancía"
		description="Cada renglón abre una capa FIFO con su propio costo."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/entrada"
			enctype="multipart/form-data"
			class="space-y-4"
		>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field
					label="Proveedor"
					name="proveedor"
				/>
				<Field
					label="Referencia / remisión"
					name="referencia"
				/>
			</div>

			<Field
				label="CFDI del proveedor (XML, opcional)"
				name="cfdi"
				hint="Si lo subes, no se puede recibir dos veces."
			>
				{#snippet children(id)}
					<input
						{id}
						type="file"
						name="cfdi"
						accept=".xml,text/xml,application/xml"
						class={INPUT}
					/>
				{/snippet}
			</Field>

			<fieldset class="space-y-3">
				<legend class="text-xs font-medium text-sand-500">Qué llegó</legend>
				{#each Array(renglones) as _, i (i)}
					<div class="rounded border border-sand-200 p-3">
						<Field
							label="Producto"
							name="productoId"
						>
							{#snippet children(id)}
								<select
									{id}
									name="productoId"
									class={INPUT}
								>
									<option value="">—</option>
									{#each conStock as p (p.id)}
										<option value={p.id}>{p.nombre}{p.sku ? ` · ${p.sku}` : ""}</option>
									{/each}
								</select>
							{/snippet}
						</Field>
						<div class="mt-3 grid grid-cols-2 gap-3">
							<Field
								label="Cantidad"
								name="cantidad"
								type="number"
								step="0.001"
								min="0"
							/>
							<Field
								label="Costo unitario"
								name="costoUnitario"
							/>
						</div>
					</div>
				{/each}
				<!-- Progressive enhancement: three rows always render, more only with JS. -->
				<Button
					type="button"
					onclick={() => (renglones += 1)}
					variant="ghost"
					size="sm"
				>
					<Plus
						size={15}
						aria-hidden="true"
					/>
					Otro renglón
				</Button>
			</fieldset>

			<Field
				label="Notas"
				name="notas"
			/>
			<Button full>Recibir</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "solicitudes" && data.puede.salida}
	<Drawer
		title="Refacciones pedidas"
		description="Surtirlas descuenta del almacén al costo FIFO."
		closeHref={closeDrawer}
	>
		{#if data.pendientes.length === 0}
			<p class="text-sm text-sand-500">Nada pendiente.</p>
		{:else}
			<ul class="space-y-3">
				{#each data.pendientes as s (s.id)}
					<li class="rounded border border-sand-200 p-3">
						<p class="flex flex-wrap items-center gap-2 text-sm">
							<span class="font-medium text-sand-950"
								>{Number(s.cantidad).toLocaleString("es-MX")} × {s.descripcion}</span
							>
							<Badge tone={solicitudEstadoTone(s.estado)}>Nota #{s.notaFolio}</Badge>
						</p>
						<p class="mt-0.5 text-xs text-sand-500">
							{s.solicitadaPor ?? "—"} · {haceCuanto(s.createdAt)}
							{#if s.productoNombre}
								· {s.productoNombre} (hay {Number(s.existencia).toLocaleString("es-MX")})
							{:else}
								· sin producto del catálogo
							{/if}
						</p>

						<div class="mt-2 flex flex-col gap-2 sm:flex-row">
							{#if s.productoId}
								<form
									method="POST"
									action="?/resolverSolicitud"
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
								action="?/resolverSolicitud"
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
									placeholder="¿Por qué no se puede?"
									class={INPUT}
								/>
								<Button
									variant="outline"
									size="sm"
									full>No hay</Button
								>
							</form>
						</div>
						{#if !s.productoId}
							<p class="mt-2 text-xs text-sand-500">
								Para surtirla hay que ligarla a un producto del catálogo. Dalo de alta primero.
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Drawer>
{/if}
