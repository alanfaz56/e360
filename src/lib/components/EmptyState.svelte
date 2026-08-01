<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		title,
		description,
		icon,
	}: { title: string; description?: string; icon?: Snippet } = $props();
</script>

<section class="rounded-lg border border-dashed border-sand-300 bg-white px-6 py-16 text-center">
	{#if icon}
		<div class="flex justify-center text-sand-400">{@render icon()}</div>
	{/if}
	<h2 class="font-display mt-3 text-xl text-sand-950">{title}</h2>
	{#if description}
		<p class="mx-auto mt-1 max-w-sm text-sm text-sand-600">{description}</p>
	{/if}
</section>
