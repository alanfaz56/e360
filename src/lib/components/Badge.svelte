<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		tone = "neutral",
		children,
	}: { tone?: "neutral" | "ok" | "warn" | "brand"; children: Snippet } = $props();

	const TONES = {
		neutral: "bg-sand-200 text-sand-600",
		ok: "bg-ok/20 text-sand-800",
		warn: "bg-accent-500/25 text-sand-800",
		brand: "bg-brand-50 text-brand-700",
	};
</script>

<span class="rounded px-2 py-0.5 text-xs font-medium {TONES[tone]}">{@render children()}</span>
