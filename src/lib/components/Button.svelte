<!--
	Renders an <a> when `href` is given, a <button> otherwise. One place to change how
	every action in the app looks.
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		href,
		variant = "primary",
		size = "md",
		type = "submit",
		full = false,
		children,
		...rest
	}: {
		href?: string;
		variant?: "primary" | "outline" | "ghost" | "invert";
		size?: "sm" | "md" | "lg";
		type?: "submit" | "button";
		full?: boolean;
		children: Snippet;
		[key: string]: unknown;
	} = $props();

	const VARIANTS = {
		primary: "bg-brand-600 text-white hover:bg-brand-700",
		outline: "border-2 border-sand-950 text-sand-950 hover:bg-sand-950 hover:text-white",
		ghost: "text-sand-700 hover:bg-sand-100 hover:text-sand-950",
		invert: "bg-white text-brand-700 hover:bg-sand-100",
	};
	const SIZES = {
		sm: "px-3 py-1.5 text-xs",
		md: "px-4 py-2.5 text-sm",
		lg: "px-6 py-3 text-base",
	};

	const classes = $derived(
		[
			"inline-flex items-center justify-center gap-2 rounded-md font-bold transition-colors",
			VARIANTS[variant],
			SIZES[size],
			full ? "w-full" : "",
		].join(" "),
	);
</script>

{#if href}
	<a {href} class={classes} {...rest}>{@render children()}</a>
{:else}
	<button {type} class={classes} {...rest}>{@render children()}</button>
{/if}
