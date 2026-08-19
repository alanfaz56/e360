<script lang="ts">
	import StatCard from "$lib/components/StatCard.svelte";
	import type { getDashboardResumen } from "$lib/server/dashboard/resumen";

	let { resumen }: { resumen: Awaited<ReturnType<typeof getDashboardResumen>> } = $props();

	const hint = (v: { pct: number | null; mejora: boolean | null }): string | undefined => {
		if (v.pct === null) return undefined;
		const signo = v.pct > 0 ? "+" : "";
		return `${signo}${v.pct}% vs. periodo anterior`;
	};
	const tono = (v: { pct: number | null; mejora: boolean | null }): "ok" | "danger" | "neutral" =>
		v.mejora === null ? "neutral" : v.mejora ? "ok" : "danger";
</script>

<section class="mb-6">
	<h2 class="font-display mb-2 text-lg text-sand-950">Resumen</h2>
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<StatCard label="Ventas" value={`$${resumen.ventas.valor}`} hint={hint(resumen.ventas.var)} tone={tono(resumen.ventas.var)} />
		<StatCard label="Utilidad" value={`$${resumen.utilidad.valor}`} hint={hint(resumen.utilidad.var)} tone={tono(resumen.utilidad.var)} />
		<StatCard
			label="Margen"
			value={resumen.margen.valor !== null ? `${resumen.margen.valor}%` : "—"}
			hint={hint(resumen.margen.var)}
			tone={tono(resumen.margen.var)}
		/>
		<StatCard
			label="Trabajos abiertos"
			value={resumen.trabajosAbiertos.valor}
			hint={hint(resumen.trabajosAbiertos.var)}
			tone={tono(resumen.trabajosAbiertos.var)}
		/>
		<StatCard
			label="Ticket promedio"
			value={resumen.ticketPromedio.valor !== null ? `$${resumen.ticketPromedio.valor}` : "—"}
			hint={hint(resumen.ticketPromedio.var)}
			tone={tono(resumen.ticketPromedio.var)}
		/>
		<StatCard label="Por cobrar" value={`$${resumen.porCobrar}`} />
		<StatCard label="Vencido" value={`$${resumen.vencido}`} tone={Number(resumen.vencido) > 0 ? "danger" : "ok"} />
	</div>
</section>
