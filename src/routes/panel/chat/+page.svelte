<script lang="ts">
	import { onMount } from "svelte";
	import { enhance } from "$app/forms";
	import { invalidateAll } from "$app/navigation";
	import Bot from "@lucide/svelte/icons/bot";
	import UserRound from "@lucide/svelte/icons/user-round";
	import Send from "@lucide/svelte/icons/send";
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import RefreshCw from "@lucide/svelte/icons/refresh-cw";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";

	let { data, form } = $props();

	// Live updates: new inbound WhatsApp/Telegram messages, without the staff member ever
	// refreshing. `invalidateAll` re-runs `load` over fetch (no full navigation), same mechanism
	// `use:enhance` below already relies on for form submits.
	onMount(() => {
		const fuente = new EventSource("/api/chat/eventos");
		fuente.onmessage = () => invalidateAll();
		return () => fuente.close();
	});

	const CANAL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", telegram: "Telegram" };

	const fecha = (iso: string) =>
		new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

	const hora = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeStyle: "short" }).format(new Date(iso));
</script>

<svelte:head><title>Chat — Estación 360</title></svelte:head>

<PageHeader
	title="Chat"
	description="Conversaciones de WhatsApp y Telegram. Toma el control cuando el bot no baste."
/>

<Flash {form} />

<div class="grid h-[calc(100vh-14rem)] min-h-[420px] gap-4 md:grid-cols-[320px_1fr]">
	<!-- Lista de conversaciones -->
	<aside class="{data.activa ? 'hidden md:block' : ''} overflow-y-auto rounded-lg border border-sand-200 bg-white">
		{#if data.conversaciones.length === 0}
			<p class="p-4 text-sm text-sand-500">No hay conversaciones todavía.</p>
		{:else}
			<ul class="divide-y divide-sand-100">
				{#each data.conversaciones as c (c.id)}
					<li>
						<a
							href="/panel/chat?id={c.id}"
							class="block px-4 py-3 hover:bg-sand-50 {data.activa?.id === c.id ? 'bg-brand-50' : ''}"
						>
							<div class="flex items-center justify-between gap-2">
								<p class="truncate font-medium text-sand-950">{c.nombre}</p>
								<span class="shrink-0 text-xs text-sand-400">{hora(c.ultimoMensajeAt)}</span>
							</div>
							<div class="mt-0.5 flex items-center gap-1.5">
								<Badge tone={c.canal === "whatsapp" ? "ok" : "brand"}>{CANAL_LABEL[c.canal] ?? c.canal}</Badge>
								{#if c.modo === "humano"}
									<Badge tone="warn">{c.tomadaPorNombre ? `Con ${c.tomadaPorNombre}` : "Con humano"}</Badge>
								{/if}
							</div>
							{#if c.ultimoMensajeTexto}
								<p class="mt-1 truncate text-sm text-sand-600">{c.ultimoMensajeTexto}</p>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- Conversación activa -->
	<section class="{data.activa ? 'flex' : 'hidden md:flex'} flex-col overflow-hidden rounded-lg border border-sand-200 bg-white">
		{#if !data.activa}
			<div class="flex flex-1 items-center justify-center text-sm text-sand-400">
				Elige una conversación de la lista.
			</div>
		{:else}
			{@const c = data.activa}
			<header class="flex items-center justify-between gap-3 border-b border-sand-200 px-4 py-3">
				<div class="flex min-w-0 items-center gap-2">
					<a
						href="/panel/chat"
						class="rounded p-1 text-sand-500 hover:bg-sand-100 md:hidden"
						aria-label="Volver a la lista"
					>
						<ArrowLeft size={18} />
					</a>
					<div class="min-w-0">
						<p class="truncate font-medium text-sand-950">{c.nombre}</p>
						<p class="text-xs text-sand-500">{CANAL_LABEL[c.canal] ?? c.canal} · {c.idExterno}</p>
					</div>
				</div>

				<div class="flex shrink-0 items-center gap-2">
					{#if c.citaCreada}
						<a
							href="/panel/citas/{c.citaCreada.id}"
							class="rounded-md border border-sand-300 px-2 py-1 text-xs font-medium text-sand-700 hover:bg-sand-50"
						>
							Cita #{c.citaCreada.folio}
						</a>
					{/if}
					<a
						href="/panel/chat?id={c.id}"
						class="rounded p-1.5 text-sand-500 hover:bg-sand-100"
						aria-label="Actualizar"
						title="Actualizar"
					>
						<RefreshCw size={16} />
					</a>
					{#if c.modo === "humano"}
						<form
							method="POST"
							action="?/regresarBot"
							use:enhance
						>
							<input
								type="hidden"
								name="conversacionId"
								value={c.id}
							/>
							<Button
								type="submit"
								variant="outline"
								size="sm"
							>
								<Bot size={16} />
								Regresar al bot
							</Button>
						</form>
					{:else}
						<form
							method="POST"
							action="?/tomarControl"
							use:enhance
						>
							<input
								type="hidden"
								name="conversacionId"
								value={c.id}
							/>
							<Button
								type="submit"
								size="sm"
							>
								<UserRound size={16} />
								Tomar control
							</Button>
						</form>
					{/if}
				</div>
			</header>

			<div class="flex-1 space-y-3 overflow-y-auto p-4">
				{#each c.mensajes as m (m.id)}
					<div class="flex {m.direccion === 'saliente' ? 'justify-end' : 'justify-start'}">
						<div
							class="max-w-[75%] rounded-lg px-3 py-2 text-sm {m.direccion === 'saliente'
								? 'bg-brand-600 text-white'
								: 'bg-sand-100 text-sand-950'}"
						>
							<p class="whitespace-pre-wrap">{m.texto}</p>
							<p
								class="mt-1 text-[11px] {m.direccion === 'saliente' ? 'text-brand-100' : 'text-sand-500'}"
							>
								{m.direccion === "saliente" ? (m.autorNombre ?? "Bot") : c.nombre} · {fecha(m.createdAt)}
							</p>
						</div>
					</div>
				{/each}
			</div>

			<form
				method="POST"
				action="?/enviar"
				class="flex items-end gap-2 border-t border-sand-200 p-3"
				use:enhance
			>
				<input
					type="hidden"
					name="conversacionId"
					value={c.id}
				/>
				<textarea
					name="texto"
					rows="2"
					required
					placeholder="Escribe una respuesta…"
					class="flex-1 resize-none rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
					>{form?.texto ?? ""}</textarea
				>
				<Button
					type="submit"
					size="sm"
				>
					<Send size={16} />
					Enviar
				</Button>
			</form>
		{/if}
	</section>
</div>
