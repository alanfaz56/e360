<!--
	AI token usage — visibility only. No spending cap, no credits, no billing: this screen exists
	so admin/gerente can see what the shop's AI reports are costing in tokens, nothing more.
-->
<script lang="ts">
	import Sparkles from "@lucide/svelte/icons/sparkles";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";

	let { data } = $props();

	const fecha = (iso: string) => new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
	const PROVEEDOR_LABEL: Record<string, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini" };
	const label = (p: string) => PROVEEDOR_LABEL[p] ?? p;
</script>

<svelte:head><title>Uso de IA — Estación 360</title></svelte:head>

<PageHeader
	title="Uso de IA"
	description="Tokens consumidos generando reportes con IA, por proveedor. Solo lectura — no hay créditos ni facturación aquí."
/>

{#if data.porProveedor.length === 0}
	<EmptyState
		title="Sin uso todavía"
		description="Aquí aparecerá el consumo de tokens en cuanto se genere el primer reporte con IA."
	>
		{#snippet icon()}<Sparkles
				size={40}
				aria-hidden="true"
			/>{/snippet}
	</EmptyState>
{:else}
	<div class="mb-8 grid gap-4 sm:grid-cols-3">
		{#each data.porProveedor as p (p.proveedor)}
			<div class="rounded-lg border border-sand-200 bg-white p-4">
				<p class="text-sm font-medium text-sand-700">{label(p.proveedor)}</p>
				<p class="mt-1 font-display text-2xl text-sand-950">{p.llamadas}</p>
				<p class="text-xs text-sand-500">llamadas</p>
				<p class="mt-2 text-sm text-sand-600">
					{p.tokensEntrada.toLocaleString("es-MX")} tokens de entrada
				</p>
				<p class="text-sm text-sand-600">{p.tokensSalida.toLocaleString("es-MX")} tokens de salida</p>
			</div>
		{/each}
	</div>

	<DataTable
		columns={["Fecha", "Proveedor", "Modelo", "Nota", "Quién", "Entrada", "Salida"]}
		items={data.recientes}
	>
		{#snippet row(r: (typeof data.recientes)[number])}
			<td class="px-3 py-2 text-sm text-sand-600">{fecha(r.createdAt)}</td>
			<td class="px-3 py-2 text-sm text-sand-900">{label(r.proveedor)}</td>
			<td class="px-3 py-2 text-sm text-sand-600">{r.modelo}</td>
			<td class="px-3 py-2 text-sm text-sand-600">{r.notaFolio ? `#${r.notaFolio}` : "—"}</td>
			<td class="px-3 py-2 text-sm text-sand-600">{r.actorNombre ?? "—"}</td>
			<td class="px-3 py-2 text-sm text-sand-600">{r.tokensEntrada.toLocaleString("es-MX")}</td>
			<td class="px-3 py-2 text-sm text-sand-600">{r.tokensSalida.toLocaleString("es-MX")}</td>
		{/snippet}
	</DataTable>
{/if}
