<!--
	The bell with its unread count. Just a link — the inbox itself is NotificationDrawer, mounted
	once by the panel layout, because the bell appears at two breakpoints and mounting two drawers
	would double the DOM and the Escape-key handler.

	URL state (`?drawer=avisos`), like every other drawer: deep-linkable, survives a form action
	round-trip, and opens with a plain <a> when JavaScript is off.

	The count refreshes on ordinary navigation rather than by polling. Every panel page already
	re-runs the layout load, so the badge is never staler than the screen being looked at — and the
	shop's phones spend no battery on a heartbeat.
-->
<script lang="ts">
	import Bell from "@lucide/svelte/icons/bell";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { noLeidas = 0 }: { noLeidas?: number } = $props();

	const abierto = $derived(page.url.searchParams.get("drawer") === "avisos");
	const href = $derived(
		abierto
			? searchHref(page.url, { drawer: null })
			: searchHref(page.url, { drawer: "avisos", menu: null }),
	);
</script>

<a
	{href}
	aria-label={noLeidas > 0 ? `Avisos (${noLeidas} sin leer)` : "Avisos"}
	aria-expanded={abierto}
	class="relative block rounded-md p-2.5 text-sand-700 transition-colors hover:bg-sand-100 hover:text-sand-950"
>
	<Bell size={20} aria-hidden="true" />
	{#if noLeidas > 0}
		<!-- The count itself, not a dot: "3 things waiting" and "17 things waiting" are different
		     days, and the number is the whole reason to look. -->
		<span
			class="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-4 text-white"
		>
			{noLeidas > 99 ? "99+" : noLeidas}
		</span>
	{/if}
</a>
