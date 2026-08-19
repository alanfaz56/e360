<script lang="ts">
	/**
	 * A small horizontal bar chart for a handful of categories — antigüedad de cartera, notas por
	 * estado. Every value is direct-labeled (there are never more than a handful of bars, so this
	 * is the "sparing" case the label rule allows), so nothing is gated behind hover. A bar with an
	 * `href` is a real link — same "every number is clickable" rule the KPI cards already follow —
	 * and doubles as its own keyboard-focusable hover target; a bar without one is a plain row.
	 */
	type Barra = {
		key: string;
		label: string;
		value: number;
		valueLabel: string;
		hint?: string | null;
		href?: string | null;
		colorClass?: string;
	};
	let { bars, max }: { bars: Barra[]; max?: number } = $props();

	const tope = $derived(max ?? Math.max(1, ...bars.map((b) => b.value)));
	const ancho = (v: number) => (v <= 0 ? 0 : Math.max(Math.round((v / tope) * 100), 3));
</script>

{#snippet fila(b: Barra)}
	<div class="mb-1 flex items-baseline justify-between gap-2 text-xs">
		<span class="font-medium text-sand-700">
			{b.label}
			{#if b.hint}<span class="text-sand-400">· {b.hint}</span>{/if}
		</span>
		<span class="tabular-nums text-sand-950">{b.valueLabel}</span>
	</div>
	<div class="h-3 w-full overflow-hidden rounded-full bg-sand-100">
		<div
			class="h-full rounded-full {b.colorClass ?? 'bg-brand-600'} transition-[width,filter] group-hover:brightness-110 group-focus-visible:brightness-110"
			style="width: {ancho(b.value)}%"
		></div>
	</div>
{/snippet}

<div class="space-y-3">
	{#each bars as b (b.key)}
		{#if b.href}
			<a
				href={b.href}
				class="group -mx-1 block rounded-md px-1 py-0.5 hover:bg-sand-50 focus-visible:bg-sand-50 focus-visible:outline-2 focus-visible:outline-brand-600"
			>
				{@render fila(b)}
			</a>
		{:else}
			<div class="group px-1 py-0.5">
				{@render fila(b)}
			</div>
		{/if}
	{/each}
</div>
