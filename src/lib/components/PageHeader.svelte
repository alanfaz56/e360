<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		title,
		description,
		actions,
	}: { title: string; description?: string; actions?: Snippet } = $props();
</script>

<div class="flex flex-wrap items-center gap-4 max-w-5xl">
	<div>
		<h1 class="font-display text-3xl text-sand-950">{title}</h1>
		{#if description}
			<p class="mt-1 text-sm text-sand-600">{description}</p>
		{/if}
	</div>
	{#if actions}
		<div class="ml-auto flex items-center gap-2">{@render actions()}</div>
	{/if}
</div>
