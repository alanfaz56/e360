<!--
	Right-side drawer. NOT a modal: no <dialog>, no focus trap, and on desktop no scrim —
	the page behind stays readable and clickable while the drawer is open.

	Open state lives in the URL (`?drawer=<name>`), so a drawer is deep-linkable, survives
	a form action round-trip, and opens/closes with plain <a> links when JavaScript is off.
	On phones it takes the full width and gets a scrim, because there is no "behind" to
	keep usable at that size.
-->
<script lang="ts">
	import X from "@lucide/svelte/icons/x";
	import { goto } from "$app/navigation";
	import type { Snippet } from "svelte";

	let {
		title,
		description,
		closeHref,
		children,
	}: {
		title: string;
		description?: string;
		closeHref: string;
		children: Snippet;
	} = $props();

	// Escape-to-close is an enhancement; the close link is the real control.
	function onkeydown(event: KeyboardEvent) {
		if (event.key === "Escape") goto(closeHref, { noScroll: true });
	}
</script>

<svelte:window {onkeydown} />

<!-- Scrim: phones only. Desktop keeps the page interactive, which is the whole point. -->
<a
	href={closeHref}
	tabindex="-1"
	aria-hidden="true"
	class="fixed inset-0 z-40 bg-sand-950/40 md:hidden"
>{""}</a>

<aside
	class="drawer fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-sand-200 bg-white shadow-xl md:w-[28rem]"
	aria-label={title}
>
	<header class="flex items-start gap-4 border-b border-sand-200 px-5 py-4">
		<div class="min-w-0">
			<h2 class="font-display text-lg text-sand-950">{title}</h2>
			{#if description}
				<p class="mt-0.5 text-sm text-sand-600">{description}</p>
			{/if}
		</div>
		<a
			href={closeHref}
			aria-label="Cerrar"
			class="-mr-1 ml-auto rounded-md p-2 text-sand-500 transition-colors hover:bg-sand-100 hover:text-sand-950"
		>
			<X size={20} aria-hidden="true" />
		</a>
	</header>

	<div class="flex-1 overflow-y-auto px-5 py-5">
		{@render children()}
	</div>
</aside>

<style>
	.drawer {
		animation: slide-in 160ms ease-out;
	}

	@keyframes slide-in {
		from {
			transform: translateX(100%);
		}
	}
</style>
