<!--
	Attach photos, PDFs, voice notes or clips to a comment.

	Uploads happen ON PICK, not on submit: the file goes straight to R2 (presigned PUT) and comes
	back as an evidence row id, which this drops into the form as a hidden input. By the time the
	comment posts, everything is already stored and the plain `<form method="POST">` carries nothing
	but ids — so the comment stays a real form submit like every other write in the panel.

	**This is an enhancement, in the Rule 7 sense.** There is no way to PUT to a signed URL from a
	plain form, so with JavaScript off the file input simply is not rendered and the comment box
	still works. Nothing that can only be said with an attachment is said only here.

	The two-step upload is the same one `EvidenciaSubir` uses, and deliberately the same endpoints:
	a second signer would be a second place to keep the content-type allowlist in step.
-->
<script lang="ts">
	import Paperclip from "@lucide/svelte/icons/paperclip";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import X from "@lucide/svelte/icons/x";
	import { ACEPTA_TODO, limiteDeTipo, megas, tipoDeMime } from "$lib/notas";
	import { ErrorVisible, mensajeDeExcepcion, mensajeDeRespuesta, toasts } from "$lib/toasts.svelte";

	let { notaId, name = "adjuntos" }: { notaId: string; name?: string } = $props();

	type Subido = { id: string; nombre: string; tipo: string };

	let subidos = $state<Subido[]>([]);
	let subiendo = $state(0);

	// The input only exists once hydrated — $effect never runs during SSR — so a no-JS user is
	// never shown a control that cannot work. Same pattern as the password reveal in Field.
	let hidratado = $state(false);
	$effect(() => {
		hidratado = true;
	});

	async function subir(archivo: File) {
		// Checked here so an oversized file is refused before it spends the shop's upload, and again
		// on the server, which is the one that counts.
		const limite = limiteDeTipo(tipoDeMime(archivo.type));
		if (archivo.size > limite) {
			throw new ErrorVisible(`${archivo.name} pasa de ${megas(limite)} MB.`);
		}

		const firmaRes = await fetch(`/api/notas/${notaId}/evidencias/firma`, {
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
			console.error("R2 rechazó el adjunto", puesto.status, await puesto.text().catch(() => ""));
			throw new ErrorVisible("El almacenamiento rechazó el archivo. Vuelve a intentarlo.");
		}

		// Only now does a row exist, so a failed upload never leaves an attachment pointing at
		// nothing. `categoria: "otra"` — an attachment on a comment is not a walk-around angle.
		const registro = await fetch(`/api/notas/${notaId}/evidencias`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				clave: firma.clave,
				categoria: "otra",
				contentType: archivo.type,
				nombre: archivo.name,
				bytes: archivo.size,
			}),
		});
		if (!registro.ok) {
			throw new ErrorVisible(await mensajeDeRespuesta(registro, "El archivo subió pero no quedó registrado."));
		}

		const { evidencia } = await registro.json();
		return { id: evidencia.id, nombre: archivo.name, tipo: tipoDeMime(archivo.type) };
	}

	async function alElegir(event: Event & { currentTarget: HTMLInputElement }) {
		const archivos = Array.from(event.currentTarget.files ?? []);
		// Cleared right away so picking the same file twice in a row still fires `change`.
		event.currentTarget.value = "";

		for (const archivo of archivos) {
			subiendo += 1;
			try {
				subidos = [...subidos, await subir(archivo)];
			} catch (err) {
				toasts.error(mensajeDeExcepcion(err, `No se pudo subir ${archivo.name}.`));
			} finally {
				subiendo -= 1;
			}
		}
	}

	// Only drops it from the form. The row and the object stay — they are already evidence of the
	// job, and deleting somebody's upload because they changed their mind about a comment is a
	// bigger action than this control implies.
	const quitar = (id: string) => (subidos = subidos.filter((s) => s.id !== id));

	const ICONO: Record<string, string> = { foto: "🖼️", documento: "📄", audio: "🎙️", video: "🎬" };
</script>

{#if hidratado}
	<div class="mt-2">
		{#each subidos as s (s.id)}
			<input
				type="hidden"
				{name}
				value={s.id}
			/>
		{/each}

		<div class="flex flex-wrap items-center gap-2">
			<label
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-sand-300 bg-white px-3 py-1.5 text-xs text-sand-700 hover:border-brand-600"
			>
				<Paperclip
					size={16}
					aria-hidden="true"
				/>
				Adjuntar
				<!-- No `capture`: this is "attach whatever you have", and forcing the camera would
				     hide the gallery, the voice memos and the PDF the customer sent by WhatsApp. -->
				<input
					type="file"
					accept={ACEPTA_TODO}
					multiple
					onchange={alElegir}
					class="sr-only"
				/>
			</label>

			{#if subiendo > 0}
				<span class="flex items-center gap-1.5 text-xs text-sand-500">
					<LoaderCircle
						size={14}
						class="animate-spin"
						aria-hidden="true"
					/>
					Subiendo {subiendo}…
				</span>
			{:else}
				<span class="text-xs text-sand-500">Fotos, PDF, audio o video</span>
			{/if}
		</div>

		{#if subidos.length > 0}
			<ul class="mt-2 flex flex-wrap gap-1.5">
				{#each subidos as s (s.id)}
					<li
						class="flex max-w-full items-center gap-1.5 rounded border border-sand-200 bg-sand-50 py-1 pl-2 pr-1 text-xs"
					>
						<span aria-hidden="true">{ICONO[s.tipo] ?? "📎"}</span>
						<span class="truncate">{s.nombre}</span>
						<button
							type="button"
							onclick={() => quitar(s.id)}
							aria-label="Quitar {s.nombre}"
							class="shrink-0 rounded p-1 text-sand-500 hover:bg-sand-200 hover:text-sand-950"
						>
							<X
								size={13}
								aria-hidden="true"
							/>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
