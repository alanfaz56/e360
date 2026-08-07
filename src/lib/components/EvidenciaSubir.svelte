<!--
	Attach photos or documents to a service note.

	Two steps, on purpose: ask the server to sign an upload, PUT the file STRAIGHT to R2, then
	tell the server it landed. The file never passes through our backend, so a serverless request
	body limit — a few megabytes, where a phone photo is routinely more — never applies.

	This is one of the few genuinely JS-only controls in the panel: there is no way to PUT to a
	signed URL from a plain form. The rest of the note works without it, and the server refuses
	uploads outright when R2 is not configured, so nothing here can half-work silently.
-->
<script lang="ts">
	import Camera from "@lucide/svelte/icons/camera";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import Button from "./Button.svelte";
	import { ErrorVisible, mensajeDeExcepcion, mensajeDeRespuesta, toasts } from "$lib/toasts.svelte";
	import { invalidateAll } from "$app/navigation";

	let { notaId, categorias }: { notaId: string; categorias: { value: string; label: string }[] } = $props();

	// Derived-with-override, so a change to the prop is picked up instead of being shadowed by
	// the initial value captured at mount.
	let categoriaElegida = $state<string | null>(null);
	const categoria = $derived(categoriaElegida ?? categorias[0]?.value ?? "otra");
	let descripcion = $state("");
	let archivos = $state<FileList | null>(null);
	let subiendo = $state(false);
	let progreso = $state({ hechos: 0, total: 0 });
	let error = $state<string | null>(null);

	async function subir(event: SubmitEvent) {
		event.preventDefault();
		if (!archivos || archivos.length === 0) return;

		subiendo = true;
		error = null;
		progreso = { hechos: 0, total: archivos.length };

		// Which file broke, not just that something did: a batch of eight photos with one HEIC the
		// bucket refused is a different problem from "the upload failed".
		let actual = "";

		try {
			for (const archivo of Array.from(archivos)) {
				actual = archivo.name;
				// 1. Ask for a signed URL. The server generates the key and checks the content type
				//    BEFORE signing, so a rejected file never gets an upload URL at all.
				const firmaRes = await fetch(`/api/notas/${notaId}/evidencias/firma`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						nombre: archivo.name,
						contentType: archivo.type,
						bytes: archivo.size,
					}),
				});
				if (!firmaRes.ok) {
					throw new ErrorVisible(await mensajeDeRespuesta(firmaRes, "No se pudo preparar la subida."));
				}
				const firma = await firmaRes.json();

				// 2. Straight to R2.
				const subida = await fetch(firma.url, {
					method: "PUT",
					headers: { "content-type": archivo.type },
					body: archivo,
				});
				// The bucket answers XML, not JSON, and its message names the bucket. The user gets a
				// sentence; the status goes to the console for whoever has to look into it.
				if (!subida.ok) {
					console.error("R2 rechazó la subida", subida.status, await subida.text().catch(() => ""));
					throw new ErrorVisible("El almacenamiento rechazó el archivo. Vuelve a intentarlo.");
				}

				// 3. Record it. Only now does a row exist, so a failed upload never leaves a
				//    phantom attachment pointing at nothing.
				const registro = await fetch(`/api/notas/${notaId}/evidencias`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						clave: firma.clave,
						categoria,
						contentType: archivo.type,
						nombre: archivo.name,
						bytes: archivo.size,
						descripcion: descripcion || null,
					}),
				});
				if (!registro.ok) {
					// The file IS in the bucket; only the row is missing. Say so, because retrying is
					// the right move and it will not duplicate anything the user can see.
					throw new ErrorVisible(
						await mensajeDeRespuesta(registro, "El archivo subió pero no quedó registrado."),
					);
				}

				progreso = { ...progreso, hechos: progreso.hechos + 1 };
			}

			archivos = null;
			descripcion = "";
			toasts.mostrar(progreso.total === 1 ? "Evidencia subida." : `${progreso.total} archivos subidos.`, "ok");
			await invalidateAll();
		} catch (err) {
			// Both: the toast is what gets noticed, the inline line is what is still on screen after
			// the toast is dismissed and the operator goes looking for which photo failed.
			error = `${actual}: ${mensajeDeExcepcion(err, "Falló la subida.")}`;
			toasts.error(error);
		} finally {
			subiendo = false;
		}
	}

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";
</script>

<form
	onsubmit={subir}
	class="mt-4 rounded border border-sand-200 bg-sand-50 p-3"
>
	<p class="flex items-center gap-1.5 text-sm font-medium text-sand-700">
		<Camera
			size={16}
			aria-hidden="true"
		/>
		Agregar evidencia
	</p>

	<div class="mt-2 grid gap-2 sm:grid-cols-3">
		<label class="block">
			<span class="block text-xs text-sand-600">Categoría</span>
			<select
				value={categoria}
				onchange={(e) => (categoriaElegida = e.currentTarget.value)}
				class={INPUT}
			>
				{#each categorias as c (c.value)}
					<option value={c.value}>{c.label}</option>
				{/each}
			</select>
		</label>

		<label class="block sm:col-span-2">
			<span class="block text-xs text-sand-600">Descripción (opcional)</span>
			<input
				type="text"
				bind:value={descripcion}
				class={INPUT}
				placeholder="Rayón lado conductor"
			/>
		</label>
	</div>

	<label class="mt-2 block">
		<span class="block text-xs text-sand-600">Archivos</span>
		<!-- `capture` opens the camera directly on a phone, which is where this gets used. -->
		<input
			type="file"
			accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
			multiple
			capture="environment"
			onchange={(e) => (archivos = e.currentTarget.files)}
			class="mt-1 w-full text-sm text-sand-700 file:mr-3 file:rounded file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white"
		/>
	</label>

	{#if error}
		<p
			role="alert"
			class="mt-2 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-sand-900"
		>
			{error}
		</p>
	{/if}

	<div class="mt-3 flex items-center gap-3">
		<Button
			size="sm"
			type="submit"
			disabled={subiendo || !archivos?.length}
		>
			{#if subiendo}
				<LoaderCircle
					size={16}
					class="animate-spin"
					aria-hidden="true"
				/>
				Subiendo {progreso.hechos}/{progreso.total}
			{:else}
				Subir
			{/if}
		</Button>
		<span class="text-xs text-sand-500">JPG, PNG, WEBP, HEIC o PDF · máx. 20 MB</span>
	</div>
</form>
