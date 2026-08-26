<!--
	Renders an <a> when `href` is given, a <button> otherwise. One place to change how
	every action in the app looks.
-->
<script lang="ts">
	import type { Snippet } from "svelte";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";

	let {
		href,
		variant = "primary",
		size = "md",
		type = "submit",
		full = false,
		disabled = false,
		loading = false,
		children,
		...rest
	}: {
		href?: string;
		variant?: "primary" | "outline" | "ghost" | "invert";
		size?: "sm" | "md" | "lg";
		type?: "submit" | "button";
		full?: boolean;
		disabled?: boolean;
		/** For work a click starts outside a form submit (fetch, async onclick) — una-vez.ts
		 *  only ever sees real POSTs, so anything else has to raise its own hand for the spinner. */
		loading?: boolean;
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
			"disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
			VARIANTS[variant],
			SIZES[size],
			full ? "w-full" : "",
		].join(" "),
	);
</script>

{#if href}
	<!--
		An <a> has no `disabled` attribute, and JS-off users must still be unable to follow it —
		so "disabled" here means the href is never rendered, not a class toggle. aria-disabled
		tells assistive tech the same thing an unclickable link communicates visually.
	-->
	<a
		href={disabled ? undefined : href}
		aria-disabled={disabled || undefined}
		aria-busy={loading || undefined}
		class="{classes} group relative"
		{...rest}
	>
		<span class="contents group-aria-busy:invisible">{@render children()}</span>
		<LoaderCircle
			size={16}
			aria-hidden="true"
			class="absolute hidden animate-spin group-aria-busy:block"
		/>
	</a>
{:else}
	<!--
		aria-busy is either set by una-vez.ts the moment a form submits, or by `loading` for
		anything that isn't one — this just gives that state a spinner either way. `contents`
		keeps the children in the button's own flex layout so the spinner can center over them
		without a layout jump.
	-->
	<button
		{type}
		disabled={disabled || loading}
		aria-busy={loading || undefined}
		class="{classes} group relative"
		{...rest}
	>
		<span class="contents group-aria-busy:invisible">{@render children()}</span>
		<LoaderCircle
			size={16}
			aria-hidden="true"
			class="absolute hidden animate-spin group-aria-busy:block"
		/>
	</button>
{/if}
