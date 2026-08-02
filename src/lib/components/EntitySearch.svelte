<!--
	Type-to-search picker for one record out of many.

	Progressive enhancement, not a replacement: the server renders a plain <select> holding the
	options it already loaded, and this swaps to a search box only once hydrated ($effect never
	runs during SSR). With JavaScript off the form still posts the same `name` field, so nothing
	in the shop breaks on an old phone — Rule 7.

	The caller owns the fetch through `buscar`, so this component knows nothing about endpoints or
	response shapes and both pickers in a drawer can search different resources.
-->
<script lang="ts">
	import Search from "@lucide/svelte/icons/search";
	import X from "@lucide/svelte/icons/x";
	import LoaderCircle from "@lucide/svelte/icons/loader-circle";
	import Field from "./Field.svelte";

	export type Opcion = { id: string; label: string; hint?: string | null };

	let {
		label,
		name,
		hint,
		placeholder,
		value = "",
		valueLabel = "",
		opciones = [],
		buscar,
		onselect,
		required = false,
		minimo = 2,
		retraso = 250,
	}: {
		label: string;
		name: string;
		hint?: string;
		placeholder?: string;
		/** Currently selected id — what gets posted. */
		value?: string;
		/** Display text for `value`, so an existing selection reads correctly on first paint. */
		valueLabel?: string;
		/** Server-rendered fallback options, used for the no-JS <select>. */
		opciones?: Opcion[];
		buscar: (q: string, signal: AbortSignal) => Promise<Opcion[]>;
		onselect?: (id: string, opcion: Opcion | null) => void;
		required?: boolean;
		/** Characters before searching. One letter would return half the table. */
		minimo?: number;
		retraso?: number;
	} = $props();

	// The toggle is useless without JS, so it only appears after hydration. Same pattern as the
	// password reveal in Field.
	let hydrated = $state(false);
	$effect(() => {
		hydrated = true;
	});

	// Derived-with-override rather than copied into state: null means "the caller's value still
	// stands", so a re-render with a new `value` is picked up instead of being shadowed.
	let elegido = $state<string | null>(null);
	let escrito = $state<string | null>(null);
	const seleccionado = $derived(elegido ?? value);
	const texto = $derived(escrito ?? valueLabel);

	let resultados = $state<Opcion[]>([]);
	let abierto = $state(false);
	let cargando = $state(false);
	let activo = $state(-1);
	let sinResultados = $state(false);

	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | null = null;

	const listboxId = $derived(`${name}-resultados`);

	function elegir(op: Opcion) {
		elegido = op.id;
		escrito = op.label;
		abierto = false;
		resultados = [];
		sinResultados = false;
		onselect?.(op.id, op);
	}

	function limpiar() {
		elegido = "";
		escrito = "";
		resultados = [];
		abierto = false;
		sinResultados = false;
		onselect?.("", null);
	}

	async function correr() {
		const q = texto.trim();
		if (q.length < minimo) {
			resultados = [];
			abierto = false;
			sinResultados = false;
			return;
		}

		// Abort the in-flight request: without this a slow earlier response can land after a
		// newer one and repopulate the list with stale matches.
		controller?.abort();
		controller = new AbortController();
		cargando = true;
		try {
			resultados = await buscar(q, controller.signal);
			sinResultados = resultados.length === 0;
			abierto = true;
			activo = -1;
		} catch (err) {
			if ((err as Error)?.name !== "AbortError") {
				resultados = [];
				sinResultados = true;
				abierto = true;
			}
		} finally {
			cargando = false;
		}
	}

	function alEscribir(event: Event & { currentTarget: HTMLInputElement }) {
		escrito = event.currentTarget.value;
		// Typing invalidates the previous pick — otherwise a half-edited name could still post
		// the id the user just typed away from.
		if (seleccionado) {
			elegido = "";
			onselect?.("", null);
		}
		clearTimeout(timer);
		timer = setTimeout(correr, retraso);
	}

	function alTeclear(event: KeyboardEvent) {
		if (event.key === "Escape") {
			abierto = false;
			return;
		}
		if (!abierto || resultados.length === 0) return;

		if (event.key === "ArrowDown") {
			event.preventDefault();
			activo = (activo + 1) % resultados.length;
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			activo = activo <= 0 ? resultados.length - 1 : activo - 1;
		} else if (event.key === "Enter" && activo >= 0) {
			// Only swallow Enter when a suggestion is highlighted, so the form still submits
			// normally the rest of the time.
			event.preventDefault();
			elegir(resultados[activo]);
		}
	}
</script>

<Field {label} {name} {hint}>
	{#snippet children(id)}
		{#if hydrated}
			<div class="relative">
				<input type="hidden" {name} value={seleccionado} />
				<div class="relative">
					<Search
						size={16}
						class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sand-400"
						aria-hidden="true"
					/>
					<input
						{id}
						type="text"
						role="combobox"
						autocomplete="off"
						aria-expanded={abierto}
						aria-controls={listboxId}
						aria-autocomplete="list"
						{placeholder}
						{required}
						value={texto}
						oninput={alEscribir}
						onkeydown={alTeclear}
						onfocus={() => resultados.length && (abierto = true)}
						onblur={() => setTimeout(() => (abierto = false), 120)}
						class="mt-1 w-full rounded-md border px-3 py-2 pl-8 text-sm focus:outline-none {seleccionado
							? 'border-ok bg-ok/5'
							: 'border-sand-300 bg-white'} focus:border-brand-600"
					/>
					{#if cargando}
						<LoaderCircle
							size={16}
							class="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-sand-400"
							aria-hidden="true"
						/>
					{:else if texto}
						<button
							type="button"
							onclick={limpiar}
							aria-label="Limpiar"
							class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-sand-500 hover:bg-sand-100 hover:text-sand-950"
						>
							<X size={15} aria-hidden="true" />
						</button>
					{/if}
				</div>

				{#if abierto}
					<ul
						id={listboxId}
						role="listbox"
						class="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-sand-300 bg-white shadow-lg"
					>
						{#if sinResultados}
							<li class="px-3 py-2 text-sm text-sand-500">Sin resultados</li>
						{:else}
							{#each resultados as op, i (op.id)}
								<li role="presentation">
									<button
										type="button"
										role="option"
										aria-selected={i === activo}
										onmousedown={(e) => e.preventDefault()}
										onclick={() => elegir(op)}
										class="block w-full px-3 py-2 text-left text-sm hover:bg-sand-100 {i === activo
											? 'bg-sand-100'
											: ''}"
									>
										<span class="block text-sand-950">{op.label}</span>
										{#if op.hint}<span class="block text-xs text-sand-500">{op.hint}</span>{/if}
									</button>
								</li>
							{/each}
						{/if}
					</ul>
				{/if}
			</div>
		{:else}
			<!-- No JavaScript: the options the server already loaded, as a plain select. -->
			<select
				{id}
				{name}
				{required}
				class="mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
			>
				<option value="">Elige…</option>
				{#each opciones as op (op.id)}
					<option value={op.id} selected={op.id === value}>
						{op.label}{op.hint ? ` · ${op.hint}` : ""}
					</option>
				{/each}
			</select>
		{/if}
	{/snippet}
</Field>
