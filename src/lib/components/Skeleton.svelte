<!-- A loading placeholder for a streamed `{#await}` block — no shimmer/skeleton pattern existed
     in the app yet. Height is a prop, not a fixed size, so it can stand in for a stat card, a
     chart or a table row without a different component for each. -->
<script lang="ts">
	let { height = "6rem" }: { height?: string } = $props();
</script>

<div
	class="animate-pulse rounded-lg border border-sand-200 bg-sand-100"
	style="height: {height}"
	aria-hidden="true"
></div>
