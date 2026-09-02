<!--
	Upload the shop's proof of payment for the current month. Reachable regardless of block state —
	`panel/+layout.server.ts` excludes this exact pathname from its redirect — so this is always the
	one screen a blocked shop can reach.

	Upload happens on pick, same two-step flow as `AdjuntarArchivos`/`EvidenciaSubir`: PUT straight
	to R2, then the returned `clave` rides in the real `<form method="POST">` as a hidden input.
	Auto-approves on submit — there is no review step for v1, so "Registrar pago" is the only action.
-->
<script lang="ts">
	import { enhance } from "$app/forms";
	import Paperclip from "@lucide/svelte/icons/paperclip";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import Button from "$lib/components/Button.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { limiteDeTipo, megas, tipoDeMime, ACEPTA_TODO } from "$lib/notas";
	import { ErrorVisible, mensajeDeExcepcion, mensajeDeRespuesta, toasts } from "$lib/toasts.svelte";
	import { sinSaltoAlRedirigir } from "$lib/sin-salto";

	let { data, form } = $props();

	type Subido = { clave: string; nombre: string; contentType: string; bytes: number };
	let subido = $state<Subido | null>(null);
	let subiendo = $state(false);

	async function subir(archivo: File) {
		const limite = limiteDeTipo(tipoDeMime(archivo.type));
		if (archivo.size > limite) {
			throw new ErrorVisible(`${archivo.name} pasa de ${megas(limite)} MB.`);
		}

		const firmaRes = await fetch("/api/facturacion-app/firma", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ nombre: archivo.name, contentType: archivo.type, bytes: archivo.size }),
		});
		if (!firmaRes.ok) throw new ErrorVisible(await mensajeDeRespuesta(firmaRes, "No se pudo preparar el archivo."));
		const firma = await firmaRes.json();

		const puesto = await fetch(firma.url, {
			method: "PUT",
			headers: { "content-type": archivo.type },
			body: archivo,
		});
		if (!puesto.ok) {
			console.error("R2 rechazó el comprobante", puesto.status, await puesto.text().catch(() => ""));
			throw new ErrorVisible("El almacenamiento rechazó el archivo. Vuelve a intentarlo.");
		}

		return { clave: firma.clave, nombre: archivo.name, contentType: archivo.type, bytes: archivo.size };
	}

	async function alElegir(event: Event & { currentTarget: HTMLInputElement }) {
		const archivo = event.currentTarget.files?.[0];
		event.currentTarget.value = "";
		if (!archivo) return;

		subiendo = true;
		try {
			subido = await subir(archivo);
		} catch (err) {
			toasts.error(mensajeDeExcepcion(err, "No se pudo subir el comprobante."));
		} finally {
			subiendo = false;
		}
	}
</script>

<svelte:head><title>Facturación de la app — Estación 360</title></svelte:head>

{#if data.dueno}
	<!-- The owner's ledger: who paid, when, and the comprobante itself — never an upload form, the
	     owner is never the one paying here. -->
	<div class="mx-auto max-w-2xl">
		<h1 class="font-display text-2xl text-sand-950">Facturación de la app</h1>
		<p class="mt-1 text-sm text-sand-600">
			Estado actual: <strong>{data.estado === "al_corriente" ? "Al corriente" : data.estado === "por_vencer" ? "Por vencer" : "Bloqueado"}</strong>
		</p>

		{#if (data.historial ?? []).length === 0}
			<p class="mt-4 text-sm text-sand-500">Todavía no hay ningún pago registrado.</p>
		{:else}
			<ul class="mt-4 space-y-2">
				{#each data.historial ?? [] as pago (pago.id)}
					<li class="flex items-center justify-between gap-3 rounded-lg border border-sand-200 bg-white p-4">
						<div class="text-sm">
							<p class="font-medium capitalize text-sand-950">{pago.cicloLabel}</p>
							<p class="mt-0.5 text-sand-600">
								{pago.montoFormateado} · subido por {pago.subidoPor} · {new Date(pago.createdAt).toLocaleDateString("es-MX")}
							</p>
						</div>
						{#if pago.url}
							<a
								href={pago.url}
								target="_blank"
								rel="noopener noreferrer"
								class="shrink-0 rounded-md border border-sand-300 px-3 py-1.5 text-xs text-sand-700 hover:border-brand-600"
							>
								Ver comprobante
							</a>
						{:else}
							<span class="shrink-0 text-xs text-sand-400">Archivo no disponible</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{:else}
	<!-- Upload the shop's proof of payment for the current month. Reachable regardless of block
	     state — `panel/+layout.server.ts` excludes this exact pathname from its redirect — so this
	     is always the one screen a blocked shop can reach.

	     Upload happens on pick, same two-step flow as `AdjuntarArchivos`/`EvidenciaSubir`: PUT
	     straight to R2, then the returned `clave` rides in the real `<form method="POST">` as a
	     hidden input. Auto-approves on submit — no review step for v1. -->
	<div class="mx-auto max-w-lg">
		<h1 class="font-display text-2xl text-sand-950">Facturación de la app</h1>
		<p class="mt-1 text-sm text-sand-600">
			Cuota mensual: <strong>{data.montoFormateado}</strong> · vence el {data.vencimientoLabel}.
		</p>

		<Flash {form} />

		{#if data.estado === "bloqueado"}
			<div class="mt-4 rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
				El sistema está bloqueado por falta de pago. Sube tu comprobante para reactivarlo — se
				desbloquea de inmediato al registrarlo.
			</div>
		{/if}

		{#if data.pago}
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-ok/40 bg-ok/5 p-4">
				<CircleCheck
					size={20}
					class="mt-0.5 shrink-0 text-ok"
					aria-hidden="true"
				/>
				<div class="text-sm">
					<p class="font-medium text-sand-950">Pago de este mes registrado</p>
					<p class="mt-0.5 text-sand-600">
						{data.pago.nombre} · {data.pago.montoFormateado} · {new Date(data.pago.createdAt).toLocaleDateString("es-MX")}
					</p>
				</div>
			</div>
		{:else}
			<form
				method="POST"
				action="?/registrar"
				use:enhance={sinSaltoAlRedirigir()}
				class="mt-4 space-y-3 rounded-lg border border-sand-200 bg-white p-4"
			>
				{#if subido}
					<input
						type="hidden"
						name="clave"
						value={subido.clave}
					/>
					<input
						type="hidden"
						name="nombre"
						value={subido.nombre}
					/>
					<input
						type="hidden"
						name="contentType"
						value={subido.contentType}
					/>
					<input
						type="hidden"
						name="bytes"
						value={subido.bytes}
					/>
					<p class="flex items-center gap-2 text-sm text-sand-700">
						<CircleCheck
							size={16}
							class="text-ok"
							aria-hidden="true"
						/>
						{subido.nombre}
					</p>
					<Button size="sm">Registrar pago</Button>
				{:else}
					<label
						class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-sand-300 bg-white px-3 py-1.5 text-xs text-sand-700 hover:border-brand-600"
					>
						<Paperclip
							size={16}
							aria-hidden="true"
						/>
						Adjuntar comprobante
						<input
							type="file"
							accept={ACEPTA_TODO}
							onchange={alElegir}
							class="sr-only"
						/>
					</label>
					{#if subiendo}
						<span class="flex items-center gap-1.5 text-xs text-sand-500">
							<LoaderCircle
								size={14}
								class="animate-spin"
								aria-hidden="true"
							/>
							Subiendo…
						</span>
					{:else}
						<p class="text-xs text-sand-500">Foto, PDF, audio o video del comprobante de pago.</p>
					{/if}
				{/if}
			</form>
		{/if}
	</div>
{/if}
