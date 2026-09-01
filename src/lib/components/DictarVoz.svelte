<!--
	Mic button: dictate instead of typing. Uses the browser's built-in speech recognition
	(Web Speech API) — no upload, no server round-trip, no AI provider involved, so this renders
	regardless of whether `ia.proveedor` is configured. Hidden entirely when the browser has no
	SpeechRecognition (Safari/Firefox historically don't) — same "enhancement, never the only way
	in" rule as `AdjuntarArchivos`: the textarea works fine by typing either way.

	Appends to whatever is already in the box rather than replacing it, so dictating twice — or
	dictating after typing part of a comment — doesn't erase what came before.
-->
<script lang="ts">
	import Mic from "@lucide/svelte/icons/mic";
	import MicOff from "@lucide/svelte/icons/mic-off";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import { toasts } from "$lib/toasts.svelte";

	let { texto = $bindable("") }: { texto: string } = $props();

	// Not in TypeScript's DOM lib (the Web Speech API isn't a W3C standard yet) — minimal shape
	// for the handful of members this component actually touches.
	type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
	type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
	type SpeechRecognitionErrorEventLike = { error: string };
	type SpeechRecognition = {
		lang: string;
		interimResults: boolean;
		continuous: boolean;
		onresult: ((e: SpeechRecognitionEventLike) => void) | null;
		onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
		onend: (() => void) | null;
		start(): void;
		stop(): void;
	};

	// SpeechRecognition only exists once hydrated in the browser — never during SSR — so a
	// no-JS/unsupported visitor is never shown a control that cannot work.
	type SpeechRecognitionCtor = new () => SpeechRecognition;
	let Ctor = $state<SpeechRecognitionCtor | null>(null);
	$effect(() => {
		const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
		Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
	});

	let escuchando = $state(false);
	let reconocedor: SpeechRecognition | null = null;

	let pidiendoPermiso = $state(false);

	async function alternar() {
		if (!Ctor) return;
		if (escuchando) {
			reconocedor?.stop();
			return;
		}

		// `SpeechRecognition.start()` prompts for permission on its own too, but asking through
		// getUserMedia first means a denial or "no microphone" surfaces as a clear message here
		// instead of a bare `onerror` from recognition — and lets the browser's own device chooser
		// (right-click the address-bar mic icon, or site settings) be reached before we ever touch
		// recognition. Stopped immediately: recognition opens and owns its own capture stream.
		pidiendoPermiso = true;
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			for (const track of stream.getTracks()) track.stop();
		} catch (err) {
			const nombre = err instanceof DOMException ? err.name : "";
			toasts.error(
				nombre === "NotFoundError"
					? "No se encontró ningún micrófono."
					: "Permiso de micrófono denegado. Actívalo desde el ícono de micrófono en la barra de direcciones.",
			);
			pidiendoPermiso = false;
			return;
		}
		pidiendoPermiso = false;

		reconocedor = new Ctor();
		reconocedor.lang = "es-MX";
		reconocedor.interimResults = false;
		reconocedor.continuous = true;

		reconocedor.onresult = (e: SpeechRecognitionEventLike) => {
			let agregado = "";
			for (let i = e.resultIndex; i < e.results.length; i++) {
				if (e.results[i].isFinal) agregado += e.results[i][0].transcript;
			}
			if (agregado) texto = texto ? `${texto.trim()} ${agregado.trim()}` : agregado.trim();
		};
		reconocedor.onerror = (e: SpeechRecognitionErrorEventLike) => {
			if (e.error === "no-speech" || e.error === "aborted") return;
			toasts.error(e.error === "not-allowed" ? "Permiso de micrófono denegado." : "No se pudo escuchar el dictado.");
		};
		reconocedor.onend = () => {
			escuchando = false;
		};

		reconocedor.start();
		escuchando = true;
	}
</script>

{#if Ctor}
	<button
		type="button"
		onclick={alternar}
		disabled={pidiendoPermiso}
		aria-pressed={escuchando}
		class="inline-flex items-center gap-2 rounded-md border-2 px-3 py-1.5 text-xs font-bold hover:border-brand-600 disabled:cursor-not-allowed disabled:opacity-50 {escuchando
			? 'border-danger/40 bg-danger/5 text-danger'
			: 'border-sand-300 bg-white text-sand-700'}"
	>
		{#if pidiendoPermiso}
			<LoaderCircle
				size={16}
				class="animate-spin"
				aria-hidden="true"
			/>
			Pidiendo permiso…
		{:else if escuchando}
			<MicOff
				size={16}
				aria-hidden="true"
			/>
			Escuchando…
		{:else}
			<Mic
				size={16}
				aria-hidden="true"
			/>
			Dictar
		{/if}
	</button>
{/if}
