<!--
	The in-app inbox. Server-rendered by the panel layout, so the whole notification centre works
	with no client JavaScript: the list is HTML, "marcar todo como leído" is a real
	<form method="POST">, and opening it is a link.

	Mounted ONCE by the layout, outside the breakpoint containers, while NotificationBell renders at
	both sizes.
-->
<script lang="ts">
	import CheckCheck from "@lucide/svelte/icons/check-check";
	import Settings from "@lucide/svelte/icons/settings";
	import Drawer from "./Drawer.svelte";
	import EmptyState from "./EmptyState.svelte";
	import Icon from "./Icon.svelte";
	import { eventoIcon, haceCuanto } from "$lib/notificaciones";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	type Aviso = {
		id: string;
		evento: string;
		titulo: string;
		cuerpo: string;
		url: string | null;
		leida: boolean;
		createdAt: string;
	};

	let { noLeidas = 0, avisos = [] }: { noLeidas?: number; avisos?: Aviso[] } = $props();

	const abierto = $derived(page.url.searchParams.get("drawer") === "avisos");
	const cerrarHref = $derived(searchHref(page.url, { drawer: null }));
</script>

{#if abierto}
	<Drawer
		title="Avisos"
		description={noLeidas > 0 ? `${noLeidas} sin leer` : "Todo al corriente"}
		closeHref={cerrarHref}
	>
		<div class="mb-4 flex flex-wrap items-center gap-2">
			{#if noLeidas > 0}
				<form method="POST" action="/panel/notificaciones?/leerTodas">
					<input type="hidden" name="volverA" value={page.url.pathname + page.url.search} />
					<button
						class="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-50"
					>
						<CheckCheck size={16} aria-hidden="true" />
						Marcar todo como leído
					</button>
				</form>
			{/if}
			<a
				href="/panel/notificaciones"
				class="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold text-sand-700 hover:bg-sand-100"
			>
				<Settings size={16} aria-hidden="true" />
				Todos y preferencias
			</a>
		</div>

		{#if avisos.length === 0}
			<EmptyState title="Sin avisos" description="Aquí llega lo que necesita tu atención." />
		{:else}
			<ul class="-mx-2 space-y-1">
				{#each avisos as aviso (aviso.id)}
					<li>
						<a
							href={aviso.url ?? cerrarHref}
							class="flex gap-3 rounded-md p-2 transition-colors hover:bg-sand-100 {aviso.leida
								? ''
								: 'bg-brand-50/60'}"
						>
							<span class="mt-0.5 shrink-0 text-sand-500">
								<Icon name={eventoIcon(aviso.evento)} size={18} aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block text-sm font-medium text-sand-950">
									{aviso.titulo}
									{#if !aviso.leida}
										<span
											class="ml-1 inline-block size-1.5 rounded-full bg-brand-600 align-middle"
											aria-label="Sin leer"
										></span>
									{/if}
								</span>
								<span class="mt-0.5 block text-xs leading-relaxed text-sand-600">{aviso.cuerpo}</span>
								<span class="mt-1 block text-[11px] text-sand-500">{haceCuanto(aviso.createdAt)}</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</Drawer>
{/if}
