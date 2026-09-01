<!--
	"Mejorar con IA" button next to the comment textarea. Sends the current draft plus the note's
	unidad/motivo context to the configured AI provider and writes the rewritten text back into
	the same bound value — the human still has the box focused and editable, nothing is posted or
	saved until they submit the comment form themselves, same as if they'd retyped it by hand.

	Rendered only when a provider is configured (`iaDisponible`, checked server-side in the page
	load — see `iaConfigurada()`) — a caller with no key set never sees a button that always fails.
-->
<script lang="ts">
	import Sparkles from "@lucide/svelte/icons/sparkles";
	import Button from "$lib/components/Button.svelte";
	import { ErrorVisible, mensajeDeExcepcion, mensajeDeRespuesta, toasts } from "$lib/toasts.svelte";

	let { notaId, texto = $bindable("") }: { notaId: string; texto: string } = $props();

	let mejorando = $state(false);
	// Off once it's run on the text currently in the box — re-running on the same output rarely
	// improves it further and just burns another call. Editing the text (by hand, or dictating
	// more) means there is something new to improve, so that re-enables it.
	let yaMejorado = $state(false);
	let ultimoResultado = $state("");

	async function mejorar() {
		if (!texto.trim()) {
			toasts.error("Escribe algo primero para poder mejorarlo.");
			return;
		}
		mejorando = true;
		try {
			const res = await fetch(`/api/notas/${notaId}/comentarios/mejorar`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ texto }),
			});
			if (!res.ok) throw new ErrorVisible(await mensajeDeRespuesta(res, "No se pudo mejorar el comentario."));
			const data = await res.json();
			texto = data.texto;
			ultimoResultado = data.texto;
			yaMejorado = true;
		} catch (err) {
			toasts.error(mensajeDeExcepcion(err, "No se pudo mejorar el comentario."));
		} finally {
			mejorando = false;
		}
	}

	const deshabilitado = $derived(mejorando || (yaMejorado && texto === ultimoResultado));
</script>

<Button
	type="button"
	variant="outline"
	size="sm"
	onclick={mejorar}
	disabled={deshabilitado}
	loading={mejorando}
	title={yaMejorado && texto === ultimoResultado ? "Ya mejorado — edita el texto para volver a usarlo" : undefined}
>
	<Sparkles
		size={16}
		aria-hidden="true"
	/>
	{mejorando ? "Mejorando…" : "Mejorar con IA"}
</Button>
