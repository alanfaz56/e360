<!--
	The fuel gauge, as a gauge.

	A dropdown of "1/8, 1/4, 3/8…" asks somebody standing next to a truck to translate a needle
	into a fraction and then find that fraction in a list. A slider IS the needle: you put it where
	the needle is. Eighths, because that is what a dashboard actually shows — storing a percentage
	would invent precision nobody can read.

	`<input type="range">` is a native control, so it posts its value with JavaScript off. Only the
	live label is an enhancement; the ticks underneath are always there, which is what makes the
	no-JS version readable rather than a bare slider with no scale.
-->
<script lang="ts">
	import Fuel from "@lucide/svelte/icons/fuel";
	import { COMBUSTIBLE_MAX, combustibleLabel } from "$lib/notas";

	let {
		name = "combustibleOctavos",
		label = "Combustible",
		value = null,
		hint,
	}: { name?: string; label?: string; value?: number | null; hint?: string } = $props();

	// Half a tank is the least wrong guess when nothing is on file, and it puts the handle in the
	// middle where it is equally quick to drag either way. Seeded once on purpose: after that the
	// slider owns the value, and re-syncing from the prop would fight the person dragging it.
	// svelte-ignore state_referenced_locally -- seeding only; the slider owns the value after that
	let octavos = $state(value ?? COMBUSTIBLE_MAX / 2);

	const MARCAS = [
		{ en: 0, texto: "V" },
		{ en: 2, texto: "¼" },
		{ en: 4, texto: "½" },
		{ en: 6, texto: "¾" },
		{ en: 8, texto: "F" },
	];
</script>

<div>
	<div class="flex items-center justify-between">
		<label
			class="flex items-center gap-1.5 text-sm font-medium text-sand-700"
			for={name}
		>
			<Fuel
				size={16}
				aria-hidden="true"
			/>
			{label}
		</label>
		<span
			class="rounded-full bg-sand-100 px-2.5 py-0.5 text-sm font-bold text-sand-900"
			aria-live="polite"
		>
			{combustibleLabel(octavos)}
		</span>
	</div>

	<input
		id={name}
		{name}
		type="range"
		min="0"
		max={COMBUSTIBLE_MAX}
		step="1"
		bind:value={octavos}
		class="mt-3 h-6 w-full cursor-pointer accent-brand-600"
		aria-describedby="{name}-marcas"
	/>

	<!-- The scale. Present without JavaScript too, or the slider has no meaning. -->
	<div
		id="{name}-marcas"
		class="mt-1 flex justify-between px-0.5 text-xs text-sand-500"
	>
		{#each MARCAS as m (m.en)}
			<span
				class:font-bold={octavos === m.en}
				class:text-brand-700={octavos === m.en}>{m.texto}</span
			>
		{/each}
	</div>

	{#if hint}
		<p class="mt-1 text-xs text-sand-500">{hint}</p>
	{/if}
</div>
