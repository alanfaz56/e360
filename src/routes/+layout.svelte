<script lang="ts">
	import "./layout.css";
	import favicon from "$lib/assets/favicon.svg";
	import Toaster from "$lib/components/Toaster.svelte";
	import { liberarFormularios, unSoloEnvio } from "$lib/una-vez";
	import { toasts } from "$lib/toasts.svelte";
	import { afterNavigate } from "$app/navigation";

	let { children } = $props();

	// Toasts are cleared when you MOVE: a message about the page you just left is noise on the one
	// you are looking at, and anything that has to survive a page load travels in the URL (`?ok=`)
	// or in `form.message`, not in a store.
	//
	// Never on `enter` — that fires on the very first load, after Flash has already handed over the
	// result of the action that redirected here, and clearing it there would swallow every message.
	afterNavigate((nav) => {
		if (nav.type !== "enter") toasts.limpiar();
	});

	// One submit per form. Installed at the root so it covers the panel, the public booking form
	// and anything added later — a per-form guard is one somebody eventually forgets to add.
	// `$effect` never runs during SSR, so a no-JS visitor is simply unaffected.
	$effect(() => unSoloEnvio());

	// A failed action re-renders the same page with the same DOM nodes, so forms have to be
	// released or "fix the field and try again" would be impossible.
	afterNavigate(liberarFormularios);
</script>

<svelte:head
	><link
		rel="icon"
		href={favicon}
	/></svelte:head
>
{@render children()}

<!-- Mounted once, above everything, so a failure raised anywhere has somewhere to land. -->
<Toaster />
