<!--
	Where every toast lands. Mounted ONCE, by the root layout, so the public pages and the panel
	report failures the same way and nothing has to remember to include it.

	**Bottom LEFT.** Drawers slide in from the right and take the full width of a phone, so a toast
	anywhere on that side is either under the drawer or on top of the form inside it — which is
	exactly where the message about that form needs to be readable. The bottom-left corner is the
	one place nothing else in this app occupies.

	Above the drawer's z-index but out of its way horizontally, and `pointer-events-none` on the
	container so the empty space beside a toast never swallows a click on the page behind.

	`role="alert"` for a failure and `role="status"` for a confirmation: a screen reader should
	interrupt for bad news and wait its turn for good news.

	Nothing here renders during SSR — the store is empty on the server. The no-JS path is
	`Flash.svelte`, which prints the same message inline.
-->
<script lang="ts">
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
	import X from "@lucide/svelte/icons/x";
	import { toasts, type Toast } from "$lib/toasts.svelte";

	// Errors carry `vida: null` and stay until dismissed; a confirmation clears itself.
	function autoCerrar(_nodo: HTMLElement, toast: Toast) {
		if (toast.vida === null) return;
		const t = setTimeout(() => toasts.quitar(toast.id), toast.vida);
		return { destroy: () => clearTimeout(t) };
	}
</script>

{#if toasts.lista.length > 0}
	<div
		class="pointer-events-none fixed inset-x-2 bottom-2 z-60 flex flex-col-reverse gap-2 sm:bottom-4 sm:left-4 sm:right-auto sm:w-96"
	>
		{#each toasts.lista as toast (toast.id)}
			<div
				use:autoCerrar={toast}
				role={toast.tono === "error" ? "alert" : "status"}
				class="toast pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg {toast.tono ===
				'error'
					? 'border-danger bg-sand-50 text-sand-900'
					: 'border-ok bg-sand-50 text-sand-900'}"
			>
				{#if toast.tono === "error"}
					<TriangleAlert
						size={16}
						aria-hidden="true"
						class="mt-0.5 shrink-0 text-danger"
					/>
				{:else}
					<CircleCheck
						size={16}
						aria-hidden="true"
						class="mt-0.5 shrink-0 text-ok"
					/>
				{/if}
				<span class="min-w-0 flex-1 break-words">{toast.mensaje}</span>
				<button
					type="button"
					onclick={() => toasts.quitar(toast.id)}
					aria-label="Cerrar aviso"
					class="-my-1 -mr-1 shrink-0 rounded p-2 text-sand-500 hover:bg-sand-950/5 hover:text-sand-950"
				>
					<X
						size={16}
						aria-hidden="true"
					/>
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast {
		animation: entra 160ms ease-out;
	}

	/* Up from the bottom edge, which is where it now comes from. */
	@keyframes entra {
		from {
			opacity: 0;
			transform: translateY(0.5rem);
		}
	}

	/* A toast that flies in is decoration; the message is the point. */
	@media (prefers-reduced-motion: reduce) {
		.toast {
			animation: none;
		}
	}
</style>
