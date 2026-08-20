<script lang="ts">
	import { page } from "$app/state";
	import Footer from "$lib/components/landing/Footer.svelte";
	import Menu from "$lib/components/landing/Menu.svelte";

	let { data, children } = $props();

	// These are single-screen utility forms, sized to fit under the header with no scroll — the
	// marketing footer doesn't belong on them and would blow that budget.
	const SIN_FOOTER = new Set(["/login", "/olvide-password", "/restablecer-password"]);
	const conFooter = $derived(!SIN_FOOTER.has(page.url.pathname));
</script>

<Menu />

{@render children()}

{#if conFooter}
	<Footer {data} />
{/if}
