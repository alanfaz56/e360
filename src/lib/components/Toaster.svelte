<!--
	Where every toast lands. Mounted ONCE, by the root layout, so the public pages and the panel
	report failures the same way and nothing has to remember to include it.

	Top of the screen on every size, deliberately: the primary action of a form lives at the bottom
	where a thumb reaches (Rule 6), and a toast that covers the button somebody is trying to press
	is worse than no toast.

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
		class="pointer-events-none fixed inset-x-2 top-2 z-60 flex flex-col gap-2 sm:left-auto sm:right-4 sm:top-4 sm:w-96"
	>
		{#each toasts.lista as toast (toast.id)}
			<div
				use:autoCerrar={toast}
				role={toast.tono === "error" ? "alert" : "status"}
				class="toast pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg {toast.tono ===
				'error'
					? 'border-danger/40 bg-danger/10 text-sand-900'
					: 'border-ok bg-ok/15 text-sand-900'}"
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
					class="-my-1 -mr-1 shrink-0 rounded p-1.5 text-sand-500 hover:bg-sand-950/5 hover:text-sand-950"
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

	@keyframes entra {
		from {
			opacity: 0;
			transform: translateY(-0.5rem);
		}
	}

	/* A toast that flies in is decoration; the message is the point. */
	@media (prefers-reduced-motion: reduce) {
		.toast {
			animation: none;
		}
	}
</style>
