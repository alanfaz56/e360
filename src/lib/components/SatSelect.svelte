<!--
	A SAT catalog picker (régimen fiscal, uso de CFDI). Options are filtered to the half that
	the customer type may legally use, so an organización is never offered "Sueldos y Salarios".

	The value posted is the bare clave — the label is display only. A key already stored but
	outside the filtered half is kept as an option so editing a customer never silently drops
	fiscal data that was valid when it was entered.
-->
<script lang="ts">
	import Field from "./Field.svelte";
	import { satParaTipo, type SatEntry } from "$lib/sat-catalogos";

	let {
		label,
		name,
		catalogo,
		tipo,
		value = "",
		hint,
	}: {
		label: string;
		name: string;
		catalogo: readonly SatEntry[];
		tipo: "persona" | "organizacion";
		value?: string | null;
		hint?: string;
	} = $props();

	const opciones = $derived.by(() => {
		const permitidas = satParaTipo(catalogo, tipo);
		if (value && !permitidas.some((e) => e.clave === value)) {
			const actual = catalogo.find((e) => e.clave === value);
			return actual ? [actual, ...permitidas] : permitidas;
		}
		return permitidas;
	});
</script>

<Field {label} {name} {hint}>
	{#snippet children(id)}
		<select
			{id}
			{name}
			class="mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
		>
			<option value="" selected={!value}>Sin especificar</option>
			{#each opciones as opcion (opcion.clave)}
				<option value={opcion.clave} selected={opcion.clave === value}>
					{opcion.clave} — {opcion.label}
				</option>
			{/each}
		</select>
	{/snippet}
</Field>
