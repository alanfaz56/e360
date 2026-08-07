<!--
	A comment's attachments, rendered by what they ARE.

	`tipo` comes from the file's own content type, decided server-side (`tipoDeMime`) — never from
	the uploader — so a video can never end up inside an `<img>` and a PDF can never end up inside
	a `<video>`.

	Three screens render this: the staff note, the mechanic's, and the customer's tracking page.
	Extracted because a picture that plays on one and downloads on another is the kind of drift
	nobody notices until a customer says "no me abre".

	`preload="none"` on audio and video: the shop's phones are on mobile data, and a note with six
	clips would otherwise start fetching all six on open.
-->
<script lang="ts">
	import FileText from "@lucide/svelte/icons/file-text";
	import Download from "@lucide/svelte/icons/download";

	type Adjunto = {
		id: string;
		tipo: string;
		nombre: string;
		contentType: string;
		bytes?: number | null;
		descripcion?: string | null;
		url: string | null;
	};

	let { adjuntos }: { adjuntos: Adjunto[] } = $props();

	const peso = (bytes: number | null | undefined) =>
		bytes == null
			? ""
			: bytes < 1024 * 1024
				? `${Math.round(bytes / 1024)} KB`
				: `${(bytes / 1024 / 1024).toFixed(1)} MB`;
</script>

{#if adjuntos.length > 0}
	<ul class="mt-2 flex flex-wrap gap-2">
		{#each adjuntos as a (a.id)}
			<li class="max-w-full">
				{#if a.url === null}
					<!-- R2 is not configured, so there is no URL to point at. Saying so beats a broken
					     image that reads as "the file is gone". -->
					<span class="block rounded border border-sand-200 px-2 py-1.5 text-xs text-sand-500">
						{a.nombre} · no disponible
					</span>
				{:else if a.tipo === "foto"}
					<a
						href={a.url}
						target="_blank"
						rel="noopener"
						title={a.descripcion ?? a.nombre}
					>
						<img
							src={a.url}
							alt={a.descripcion ?? a.nombre}
							loading="lazy"
							class="size-24 rounded border border-sand-200 object-cover"
						/>
					</a>
				{:else if a.tipo === "audio"}
					<!-- Full width on a phone: an audio player squeezed into a chip has no usable
					     scrubber, and a voice note is listened to, not glanced at. -->
					<audio
						controls
						preload="none"
						src={a.url}
						class="w-64 max-w-full"
					></audio>
				{:else if a.tipo === "video"}
					<!-- svelte-ignore a11y_media_has_caption -->
					<!-- No captions track: these are ten-second clips of a noise a truck makes, filmed
					     in the bay. There is no dialogue to caption and no transcript to attach, and a
					     dummy empty track would be a worse lie than none. The `descripcion` beside it
					     is what carries the meaning. -->
					<video
						controls
						preload="none"
						playsinline
						src={a.url}
						aria-label={a.descripcion ?? a.nombre}
						class="max-h-48 w-64 max-w-full rounded border border-sand-200 bg-sand-950"
					></video>
					{#if a.descripcion}
						<span class="mt-1 block max-w-64 text-xs text-sand-600">{a.descripcion}</span>
					{/if}
				{:else}
					<a
						href={a.url}
						target="_blank"
						rel="noopener"
						class="flex items-center gap-1.5 rounded border border-sand-200 bg-white px-2 py-1.5 text-xs text-sand-700 hover:border-brand-600"
					>
						<FileText
							size={14}
							aria-hidden="true"
							class="shrink-0"
						/>
						<span class="truncate">{a.nombre}</span>
						{#if a.bytes}<span class="shrink-0 text-sand-400">{peso(a.bytes)}</span>{/if}
						<Download
							size={13}
							aria-hidden="true"
							class="shrink-0 text-sand-400"
						/>
					</a>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
