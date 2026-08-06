<!--
	"Mi trabajo" — the mechanic's screen.

	Built for a phone held in the bay with one dirty hand: big cards, big tap targets, one column at
	every size that matters. No table, because a table at 360px is a scroll bar.

	No prices anywhere. What the shop charges is not the mechanic's decision, which is why the data
	comes through `notaParaTaller` and not the full note mapper.
-->
<script lang="ts">
	import Car from "@lucide/svelte/icons/car";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import Gauge from "@lucide/svelte/icons/gauge";
	import Package from "@lucide/svelte/icons/package";
	import Wrench from "@lucide/svelte/icons/wrench";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import { notaEstadoTone } from "$lib/notas";
	import { haceCuanto } from "$lib/notificaciones";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data } = $props();

	const pendientes = $derived(data.notas.filter((n) => !n.trabajoTerminadoAt));
	const terminadas = $derived(data.notas.filter((n) => n.trabajoTerminadoAt));
</script>

<svelte:head><title>Mi trabajo — Estación 360</title></svelte:head>

<PageHeader
	title="Mi trabajo"
	description={pendientes.length === 0
		? "No tienes unidades pendientes."
		: `${pendientes.length} unidad(es) esperándote.`}
>
	{#snippet actions()}
		<Button
			href={searchHref(page.url, { cerradas: data.cerradas ? null : "1" })}
			variant={data.cerradas ? "primary" : "ghost"}
			size="sm"
		>
			Ver cerradas
		</Button>
	{/snippet}
</PageHeader>

{#if data.notas.length === 0}
	<div class="mt-6">
		<EmptyState
			title="Nada asignado"
			description="Cuando el mostrador te asigne una unidad, aparece aquí. También te llega un aviso."
		>
			{#snippet icon()}<Wrench
					size={40}
					aria-hidden="true"
				/>{/snippet}
		</EmptyState>
	</div>
{:else}
	<div class="mt-6 space-y-6">
		{#each [{ titulo: "Pendientes", lista: pendientes }, { titulo: "Terminadas por mí", lista: terminadas }] as grupo (grupo.titulo)}
			{#if grupo.lista.length > 0}
				<section>
					<h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-sand-500">
						{grupo.titulo} ({grupo.lista.length})
					</h2>
					<ul class="space-y-3">
						{#each grupo.lista as nota (nota.id)}
							<li>
								<!-- The whole card is the tap target: a thumb in a glove does not aim. -->
								<a
									href="/panel/taller/{nota.id}"
									class="block rounded-lg border bg-white p-4 transition-colors hover:border-brand-600
										{nota.trabajoTerminadoAt ? 'border-sand-200 opacity-75' : 'border-sand-300'}"
								>
									<div class="flex flex-wrap items-center gap-2">
										<span class="font-display text-lg text-sand-950">
											{nota.unidad ?? "Unidad"}
										</span>
										<Badge tone={notaEstadoTone(nota.estado)}>{nota.estadoLabel}</Badge>
										{#if nota.trabajoTerminadoAt}
											<Badge tone="ok">Terminada</Badge>
										{/if}
										<span class="ml-auto text-xs text-sand-500">#{nota.folio}</span>
									</div>

									{#if nota.unidadDetalle}
										<p class="mt-0.5 flex items-center gap-1.5 text-sm text-sand-600">
											<Car
												size={14}
												aria-hidden="true"
											/>
											{nota.unidadDetalle}
										</p>
									{/if}

									<p class="mt-2 text-sm leading-relaxed text-sand-800">{nota.motivo}</p>

									<div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-sand-500">
										{#if nota.kilometraje !== null}
											<span class="flex items-center gap-1">
												<Gauge
													size={13}
													aria-hidden="true"
												/>
												{nota.kilometraje.toLocaleString("es-MX")} km
											</span>
										{/if}
										{#if nota.refaccionesPendientes > 0}
											<span class="flex items-center gap-1 font-medium text-accent-700">
												<Package
													size={13}
													aria-hidden="true"
												/>
												{nota.refaccionesPendientes} refacción(es) pedidas
											</span>
										{/if}
										{#if nota.tallerActualNombre}
											<span class="flex items-center gap-1">
												<Wrench
													size={13}
													aria-hidden="true"
												/>
												En {nota.tallerActualNombre}
											</span>
										{/if}
										{#if nota.trabajoTerminadoAt}
											<span class="flex items-center gap-1 text-ok">
												<CircleCheck
													size={13}
													aria-hidden="true"
												/>
												Terminaste {haceCuanto(nota.trabajoTerminadoAt)}
											</span>
										{:else}
											<span class="ml-auto">Entró {haceCuanto(nota.recibidaAt)}</span>
										{/if}
									</div>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	</div>
{/if}
