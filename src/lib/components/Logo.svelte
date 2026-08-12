<!--
	The brand mark — a badge, not a horizontal wordmark, so it is sized by height and left to find
	its own width rather than stretched to fill a line. `red` is the on-screen default everywhere;
	`black` exists for the printable documents (DocumentoImprimible.svelte), where a large solid-red
	block is heavier on ink than a mark that prints fine in black.
-->
<script lang="ts">
	let {
		variant = "red",
		class: className = "h-8 w-auto",
	}: { variant?: "red" | "black"; class?: string } = $props();
</script>

<img
	src="/logo_{variant}.png"
	alt="Estación 360"
	class={className}
/>
