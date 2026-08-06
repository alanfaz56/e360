<!-- A dashboard counter. Renders as a link when `href` is given, so a number is clickable. -->
<script lang="ts">
	import Icon from "./Icon.svelte";
	import type { NavItem } from "$lib/nav";

	let {
		label,
		value,
		hint,
		icon,
		href,
		tone = "neutral",
	}: {
		label: string;
		value: number | string;
		hint?: string;
		icon?: NavItem["icon"];
		href?: string;
		tone?: "neutral" | "brand" | "warn" | "ok" | "danger";
	} = $props();

	const TONES = {
		neutral: "text-sand-950",
		brand: "text-brand-600",
		warn: "text-accent-500",
		ok: "text-ok",
		danger: "text-danger",
	};

	const Tag = $derived(href ? "a" : "div");
</script>

<svelte:element
	this={Tag}
	{href}
	class="block rounded-lg border border-sand-200 bg-white p-4 transition-colors {href
		? 'hover:border-brand-600'
		: ''}"
>
	<p class="flex items-center gap-1.5 text-sm text-sand-600">
		{#if icon}<Icon name={icon} size={16} aria-hidden="true" />{/if}
		{label}
	</p>
	<p class="font-display mt-1 text-3xl {TONES[tone]}">{value}</p>
	{#if hint}<p class="mt-0.5 text-xs text-sand-500">{hint}</p>{/if}
</svelte:element>
