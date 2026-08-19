<script lang="ts">
	/**
	 * A daily column trend — ingresos de los últimos N días. No per-day drill-down exists, so
	 * there's no href here (unlike BarList); the interaction is hover/focus for the exact value,
	 * which the native `title` attribute already gives for free without JavaScript — every value
	 * is reachable without hovering at all, it's just easier to read that way.
	 */
	type Punto = { key: string; label: string; value: number; valueLabel: string };
	let { puntos }: { puntos: Punto[] } = $props();

	const tope = $derived(Math.max(1, ...puntos.map((p) => p.value)));
	const alto = (v: number) => (v <= 0 ? 2 : Math.max(Math.round((v / tope) * 100), 4));
</script>

<div class="flex h-32 items-end gap-1">
	{#each puntos as p (p.key)}
		<!-- A real <button>, not a div+tabindex: it's natively focusable and keyboard-reachable
		     without inventing a role, and the native `title` gives the exact value on both hover
		     and keyboard focus — no click handler needed, it's not an action. -->
		<button
			type="button"
			class="group relative block w-full flex-1 cursor-default bg-transparent p-0"
			title="{p.label}: {p.valueLabel}"
		>
			<div
				class="mx-auto w-full max-w-4 rounded-t-sm bg-brand-600 transition-[filter] group-hover:brightness-110 group-focus-visible:brightness-110"
				style="height: {alto(p.value)}%"
			></div>
		</button>
	{/each}
</div>
<div class="mt-1 flex gap-1">
	{#each puntos as p (p.key)}
		<span class="flex-1 truncate text-center text-[10px] text-sand-400">{p.label}</span>
	{/each}
</div>
