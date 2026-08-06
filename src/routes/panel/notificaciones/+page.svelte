<script lang="ts">
	import CheckCheck from "@lucide/svelte/icons/check-check";
	import Smartphone from "@lucide/svelte/icons/smartphone";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import Button from "$lib/components/Button.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Icon from "$lib/components/Icon.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import PushToggle from "$lib/components/PushToggle.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { eventoIcon, haceCuanto } from "$lib/notificaciones";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();
</script>

<svelte:head><title>Avisos — Estación 360</title></svelte:head>

<PageHeader
	title="Avisos"
	description="Qué te avisamos, cómo te llega y en qué dispositivos."
>
	{#snippet actions()}
		{#if data.noLeidas > 0}
			<form
				method="POST"
				action="?/leerTodas"
			>
				<Button
					variant="outline"
					size="sm"
				>
					<CheckCheck
						size={16}
						aria-hidden="true"
					/>
					Marcar todo como leído
				</Button>
			</form>
		{/if}
	{/snippet}
</PageHeader>

<Flash {form} />

{#if form?.guardado}
	<p
		role="status"
		class="mt-4 rounded border border-ok bg-ok/15 px-3 py-2 text-sm text-sand-800"
	>
		Preferencias guardadas.
	</p>
{/if}

<!--
	Mobile first: one column on a phone, the history beside the settings only from `lg`. The
	history is the thing somebody opens this screen for, so it comes first in the DOM too.
-->
<div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
	<section>
		<div class="mb-3 flex flex-wrap items-center gap-2">
			<h2 class="font-display text-xl text-sand-950">Historial</h2>
			<div class="ml-auto flex gap-1">
				<Button
					href={searchHref(page.url, { noLeidas: null, page: null })}
					variant={data.soloNoLeidas ? "ghost" : "primary"}
					size="sm">Todos</Button
				>
				<Button
					href={searchHref(page.url, { noLeidas: "1", page: null })}
					variant={data.soloNoLeidas ? "primary" : "ghost"}
					size="sm">Sin leer ({data.noLeidas})</Button
				>
			</div>
		</div>

		{#if data.notificaciones.length === 0}
			<EmptyState
				title={data.soloNoLeidas ? "Nada sin leer" : "Sin avisos todavía"}
				description="Aquí queda el registro de todo lo que te avisamos, aunque los avisos del navegador estén apagados."
			/>
		{:else}
			<ul class="space-y-2">
				{#each data.notificaciones as aviso (aviso.id)}
					<li
						class="rounded-lg border bg-white p-3 {aviso.leida
							? 'border-sand-200'
							: 'border-brand-200 bg-brand-50/40'}"
					>
						<div class="flex gap-3">
							<span class="mt-0.5 shrink-0 text-sand-500">
								<Icon
									name={eventoIcon(aviso.evento)}
									size={18}
									aria-hidden="true"
								/>
							</span>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-sand-950">{aviso.titulo}</p>
								<p class="mt-0.5 text-sm leading-relaxed text-sand-600">{aviso.cuerpo}</p>
								<p class="mt-1 text-xs text-sand-500">{haceCuanto(aviso.createdAt)}</p>
							</div>
						</div>
						<div class="mt-2 flex flex-wrap items-center gap-2">
							{#if aviso.url}
								<Button
									href={aviso.url}
									variant="ghost"
									size="sm">Abrir</Button
								>
							{/if}
							{#if !aviso.leida}
								<form
									method="POST"
									action="?/leerUna"
									class="ml-auto"
								>
									<input
										type="hidden"
										name="id"
										value={aviso.id}
									/>
									<Button
										variant="ghost"
										size="sm">Marcar leído</Button
									>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>

			{#if data.totalPages > 1}
				<div class="mt-4 flex items-center gap-2">
					{#if data.page > 1}
						<Button
							href={searchHref(page.url, { page: String(data.page - 1) })}
							variant="outline"
							size="sm">Anterior</Button
						>
					{/if}
					<span class="text-xs text-sand-500">Página {data.page} de {data.totalPages}</span>
					{#if data.page < data.totalPages}
						<Button
							href={searchHref(page.url, { page: String(data.page + 1) })}
							variant="outline"
							size="sm">Siguiente</Button
						>
					{/if}
				</div>
			{/if}
		{/if}
	</section>

	<aside class="space-y-6">
		<section class="rounded-lg border border-sand-200 bg-white p-4">
			<h2 class="font-display flex items-center gap-2 text-lg text-sand-950">
				<Smartphone
					size={18}
					aria-hidden="true"
				/>
				Este dispositivo
			</h2>
			<p class="mb-3 mt-1 text-xs leading-relaxed text-sand-600">
				Con los avisos activados te llegan aunque no tengas la página abierta. Puedes activarlos en varios
				teléfonos y computadoras.
			</p>
			<PushToggle clavePublica={data.clavePublica} />

			{#if data.dispositivos.length > 0}
				<ul class="mt-4 space-y-2 border-t border-sand-200 pt-3">
					{#each data.dispositivos as d (d.id)}
						<li class="flex items-center gap-2 text-xs">
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium text-sand-800">{d.etiqueta}</span>
								<span class="block text-sand-500">
									{d.ultimoEnvioAt ? `Último aviso ${haceCuanto(d.ultimoEnvioAt)}` : "Sin avisos aún"}
									{#if d.fallos > 0}· {d.fallos} fallo(s){/if}
								</span>
							</span>
							<form
								method="POST"
								action="?/quitarDispositivo"
							>
								<input
									type="hidden"
									name="id"
									value={d.id}
								/>
								<button
									aria-label="Quitar {d.etiqueta}"
									class="rounded-md p-2 text-sand-500 hover:bg-sand-100 hover:text-danger"
								>
									<Trash2
										size={16}
										aria-hidden="true"
									/>
								</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="rounded-lg border border-sand-200 bg-white p-4">
			<h2 class="font-display text-lg text-sand-950">Qué quiero recibir</h2>
			<p class="mb-3 mt-1 text-xs leading-relaxed text-sand-600">
				<strong>En la app</strong> es la campanita.
				<strong>Push</strong> es el aviso del navegador.
			</p>

			<form
				method="POST"
				action="?/preferencias"
				class="space-y-3"
			>
				{#each data.preferencias as p (p.evento)}
					<div class="border-b border-sand-100 pb-3 last:border-0 last:pb-0">
						<p class="text-sm font-medium text-sand-900">{p.label}</p>
						<p class="mt-0.5 text-xs text-sand-500">{p.descripcion}</p>
						<div class="mt-2 flex gap-4">
							<!-- ~44px of touch area per control: this is used standing next to a truck. -->
							<label class="flex cursor-pointer items-center gap-2 py-1.5 text-xs text-sand-700">
								<input
									type="checkbox"
									name="app:{p.evento}"
									checked={p.enApp}
									class="size-4 accent-brand-600"
								/>
								En la app
							</label>
							<label class="flex cursor-pointer items-center gap-2 py-1.5 text-xs text-sand-700">
								<input
									type="checkbox"
									name="push:{p.evento}"
									checked={p.push}
									class="size-4 accent-brand-600"
								/>
								Push
							</label>
						</div>
					</div>
				{/each}
				<Button full>Guardar preferencias</Button>
			</form>
		</section>
	</aside>
</div>
