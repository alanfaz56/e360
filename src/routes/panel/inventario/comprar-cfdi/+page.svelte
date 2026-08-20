<script lang="ts">
	import PageHeader from "$lib/components/PageHeader.svelte";
	import Button from "$lib/components/Button.svelte";
	import Field from "$lib/components/Field.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { CLAVES_PROD_SERV, CLAVES_UNIDAD } from "$lib/sat-catalogos";

	let { form } = $props();

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";
</script>

<svelte:head><title>Importar CFDI — Estación 360</title></svelte:head>

<PageHeader
	title="Importar CFDI"
	description="Sube la factura de un proveedor y recibe sus renglones sin retipearlos."
/>

<Flash {form} />

{#if form?.recibido}
	<p class="mt-4 rounded border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-sand-800">
		Mercancía recibida. <a
			class="font-bold underline"
			href="/panel/inventario">Ver inventario</a
		>
	</p>
{:else if form?.preview}
	<form
		method="POST"
		action="?/confirmar"
		class="mt-5 space-y-4"
	>
		<textarea
			name="xml"
			class="hidden">{form.xml}</textarea
		>
		{#if form.emisor}
			<p class="text-sm text-sand-600">Proveedor: <strong class="text-sand-950">{form.emisor}</strong></p>
		{/if}

		<div class="space-y-3">
			{#each form.filas as fila, i (i)}
				<div class="rounded-lg border border-sand-200 bg-white p-4">
					<p class="text-sm font-medium text-sand-950">{fila.descripcion || `Renglón ${i + 1}`}</p>
					<p class="mt-0.5 text-xs text-sand-500">
						ClaveProdServ {fila.claveProdServ || "—"} · {fila.claveUnidad} · {fila.unidad}
						{#if fila.noIdentificacion}· NoIdentificacion {fila.noIdentificacion}{/if}
					</p>

					<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
						<Field
							label="Cantidad"
							name="cantidad"
							type="number"
							step="0.001"
							min="0"
							value={fila.cantidad}
							required
						/>
						<Field
							label="Costo unitario"
							name="costoUnitario"
							value={fila.valorUnitario}
							required
						/>
					</div>

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
								<option value="">— Crear producto nuevo —</option>
								{#each form.catalogo as p (p.id)}
									<option
										value={p.id}
										selected={fila.matchId === p.id}>{p.nombre}{p.sku ? ` · ${p.sku}` : ""}</option
									>
								{/each}
							</select>
						{/snippet}
					</Field>

					<p class="mt-3 text-xs font-medium text-sand-500">
						Si eliges "Crear producto nuevo", completa esto — se ignora si arriba escogiste uno existente:
					</p>
					<div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
						<Field
							label="Nombre"
							name="nombre"
							value={fila.descripcion}
						/>
						<Field
							label="Precio de venta"
							name="precioVenta"
							hint="El CFDI trae lo que pagamos, no lo que cobramos."
						/>
						<Field
							label="ClaveProdServ"
							name="claveProdServ"
						>
							{#snippet children(id)}
								<input
									{id}
									name="claveProdServ"
									list="claves-prodserv"
									pattern="[0-9]{'{'}8{'}'}"
									class={INPUT}
									value={fila.claveProdServ}
								/>
							{/snippet}
						</Field>
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
											selected={fila.claveUnidad === u.clave}
										>
											{u.clave} · {u.descripcion}
										</option>
									{/each}
								</select>
							{/snippet}
						</Field>
					</div>
					<input
						type="hidden"
						name="unidad"
						value={fila.unidad || "Pieza"}
					/>
				</div>
			{/each}
		</div>

		<datalist id="claves-prodserv">
			{#each CLAVES_PROD_SERV as c (c.clave)}
				<option value={c.clave}>{c.descripcion}</option>
			{/each}
		</datalist>

		<Button full>Confirmar y recibir</Button>
	</form>
{:else}
	<form
		method="POST"
		action="?/previsualizar"
		enctype="multipart/form-data"
		class="mt-5 max-w-md space-y-4 rounded-lg border border-sand-200 bg-white p-6"
	>
		<Field
			label="CFDI del proveedor (XML)"
			name="cfdi"
			required
		>
			{#snippet children(id)}
				<input
					{id}
					type="file"
					name="cfdi"
					accept=".xml,text/xml,application/xml"
					required
					class={INPUT}
				/>
			{/snippet}
		</Field>
		<Button full>Revisar renglones</Button>
	</form>
{/if}
