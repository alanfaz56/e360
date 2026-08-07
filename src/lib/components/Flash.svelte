<!--
	What just happened. One component, both outcomes.

	A successful action ends in a redirect, so its result rides in `?ok=<clave>`; a failed one
	returns `fail()` with a `message` and no redirect at all. Two different transports for the same
	question — "did that work?" — so they get one answer shape here instead of a hand-rolled
	`{#if form?.message}` block on every page, which is how the panel ended up confirming some
	actions and silently swallowing others.

	**Once hydrated it hands the message to the toast store and stops rendering itself**, so a
	result from a form action and a failure raised by a `fetch` look and behave the same. Without
	JavaScript the inline panel below is what the user gets — the panel has to keep working on an
	old phone with scripts off (Rule 7), and a toast is JavaScript by definition.

	`role="status"` for the good news and `role="alert"` for the bad: a screen reader should
	interrupt for a failure and not for a confirmation.

	The dismiss control is a plain `<a>` back to the same URL without `?ok=`, so it works with
	JavaScript off — and reloading the page after acting no longer re-announces a stale success,
	because the link is the only way the param sticks around.
-->
<script lang="ts">
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
	import X from "@lucide/svelte/icons/x";
	import { untrack } from "svelte";
	import { flashMensaje } from "$lib/flash";
	import { toasts } from "$lib/toasts.svelte";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { form }: { form?: { message?: string } | null } = $props();

	const exito = $derived(flashMensaje(page.url.searchParams.get("ok")));
	const error = $derived(form?.message ?? null);
	const cerrar = $derived(searchHref(page.url, { ok: null }));

	// $effect never runs during SSR, so the server always emits the inline panel and the browser
	// takes over from there.
	let hidratado = $state(false);
	$effect(() => {
		hidratado = true;

		// Depend on the FORM OBJECT and the URL, never on the toast store.
		//
		// This bit is load-bearing and was a real bug: `toasts.mostrar` READS the list (to collapse
		// duplicates), so without `untrack` the list became a dependency of this effect — and
		// dismissing a toast changed the list, re-ran the effect, and put the toast straight back.
		// The close button looked broken because it was being undone a frame later.
		//
		// Depending on `form` itself rather than on the message string also means two identical
		// failures in a row are two pieces of news: comparing strings would swallow the second,
		// because `$derived` does not re-notify when a value is equal to what it already was.
		void form;
		void page.url.search;

		untrack(() => {
			if (error) toasts.error(error);
			else if (exito) toasts.mostrar(exito, "ok");
		});
	});
</script>

{#if !hidratado}
	{#if error}
		<p
			role="alert"
			class="mb-4 flex items-start gap-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-sand-900"
		>
			<TriangleAlert
				size={16}
				aria-hidden="true"
				class="mt-0.5 shrink-0 text-danger"
			/>
			<span>{error}</span>
		</p>
	{:else if exito}
		<p
			role="status"
			class="mb-4 flex items-start gap-2 rounded border border-ok bg-ok/15 px-3 py-2 text-sm text-sand-900"
		>
			<CircleCheck
				size={16}
				aria-hidden="true"
				class="mt-0.5 shrink-0 text-ok"
			/>
			<span class="min-w-0">{exito}</span>
			<a
				href={cerrar}
				class="-my-1 -mr-1 ml-auto shrink-0 rounded p-1 text-sand-500 hover:text-sand-900"
				aria-label="Cerrar aviso"
			>
				<X
					size={16}
					aria-hidden="true"
				/>
			</a>
		</p>
	{/if}
{/if}
