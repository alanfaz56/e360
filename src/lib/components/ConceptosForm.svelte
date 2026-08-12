<!--
	The renglón editor shared by every parallel-array line-item form: a plain `<form>` posts
	tipo[]/descripcion[]/cantidad[]/<montoName>[]/productoId[] because that is what HTML can send,
	and the action zips them back into objects server-side. Every row renders all its inputs,
	always — a `<select>` that disappears when the catalogue is empty would shift every later
	row's fields by one.

	Three rows exist from first render so the form works with JavaScript off; "agregar renglón" is
	the enhancement, not the mechanism. Rows are never removed here — a blank row is dropped by the
	server action, which behaves the same as a delete button without needing one.

	Used by the cotización drawer (`montoName="precioUnitario"`, tipo shown) and the cotización
	interna drawer (`montoName="costoUnitario"`, tipo hidden — a cost estimate has no SAT-facing
	concepto type).
-->
<script lang="ts">
	import Plus from "@lucide/svelte/icons/plus";
	import Button from "$lib/components/Button.svelte";

	export type ConceptoFila = {
		productoId: string;
		tipo: string;
		descripcion: string;
		cantidad: string;
		monto: string;
	};

	let {
		filas = $bindable(),
		productos,
		montoName,
		montoLabel,
		mostrarTipo = true,
		tipos = [],
		formatoOpcion,
		onProducto,
	}: {
		filas: ConceptoFila[];
		productos: Record<string, unknown>[];
		montoName: string;
		montoLabel: string;
		mostrarTipo?: boolean;
		tipos?: { value: string; label: string }[];
		formatoOpcion: (p: Record<string, unknown>) => string;
		onProducto?: (i: number, producto: Record<string, unknown> | undefined) => void;
	} = $props();

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const filaVacia = (): ConceptoFila => ({
		productoId: "",
		tipo: tipos[0]?.value ?? "",
		descripcion: "",
		cantidad: "1",
		monto: "",
	});
	const agregarFila = () => (filas = [...filas, filaVacia()]);

	function elegirProducto(i: number, id: string) {
		filas[i].productoId = id;
		onProducto?.(
			i,
			productos.find((p) => p.id === id),
		);
	}
</script>

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
					{#each productos as p (p.id)}
						<option value={p.id as string}>{formatoOpcion(p)}</option>
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

			<div class="mt-2 grid grid-cols-2 gap-2 {mostrarTipo ? 'sm:grid-cols-3' : ''}">
				{#if mostrarTipo}
					<label class="block text-xs text-sand-600">
						Tipo
						<select
							name="tipo"
							class={INPUT}
							bind:value={fila.tipo}
						>
							{#each tipos as t (t.value)}
								<option value={t.value}>{t.label}</option>
							{/each}
						</select>
					</label>
				{/if}
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
				<label class="col-span-2 block text-xs text-sand-600 {mostrarTipo ? 'sm:col-span-1' : ''}">
					{montoLabel}
					<input
						type="text"
						inputmode="decimal"
						name={montoName}
						placeholder="0.00"
						class={INPUT}
						bind:value={fila.monto}
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
