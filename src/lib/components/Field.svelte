<!--
	Label + control + hint. Pass `children` to supply your own control (a <select>, say);
	otherwise you get an <input> configured from the props.

	Password fields get a show/hide toggle for free — it lives here rather than in each
	form so every password box in the app behaves the same.
-->
<script lang="ts">
	import Eye from "@lucide/svelte/icons/eye";
	import EyeOff from "@lucide/svelte/icons/eye-off";
	import type { Snippet } from "svelte";
	import type { Iti } from "intl-tel-input";
	import "intl-tel-input/styles";

	let {
		label,
		name,
		type = "text",
		hint,
		error,
		value = "",
		required = false,
		children,
		...rest
	}: {
		label: string;
		name: string;
		type?: string;
		hint?: string;
		error?: string;
		value?: string;
		required?: boolean;
		children?: Snippet<[string]>;
		[key: string]: unknown;
	} = $props();

	const hintId = $derived(`${name}-hint`);
	const errorId = $derived(`${name}-error`);
	// Both, either, or neither may be present — only wire up the ones that render.
	const describedBy = $derived(
		[hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined,
	);

	const isPassword = $derived(type === "password");
	const isTel = $derived(type === "tel");
	let revealed = $state(false);

	// The toggle is useless without JavaScript, so it is only rendered once the component
	// has hydrated — $effect never runs during SSR. No dead button for no-JS users.
	let hydrated = $state(false);
	$effect(() => {
		hydrated = true;
	});

	// País por default México, EUA/Canadá y el resto de LATAM como favoritos arriba de la
	// lista. El input REAL sigue llamándose `name` y sigue siendo texto plano — con JS
	// apagado se ve y funciona exactamente igual que antes. Con JS, se reescribe su propio
	// valor a E.164 justo antes de que el formulario lo serialice, así el server nunca tiene
	// que saber que este widget existe.
	let telEl: HTMLInputElement | undefined = $state();
	$effect(() => {
		if (!isTel || !telEl) return;
		const input = telEl;
		let iti: Iti | undefined;
		let form: HTMLFormElement | null = null;
		const onSubmit = () => {
			const numero = iti?.getNumber("E164");
			if (numero) input.value = numero;
		};

		let cancelado = false;
		(async () => {
			const [{ default: intlTelInput }] = await Promise.all([import("intl-tel-input")]);
			if (cancelado) return;
			iti = intlTelInput(input, {
				initialCountry: "mx",
				countryOrder: ["mx", "us", "ca", "gt", "hn", "sv", "ni", "cr", "pa", "co", "ve", "ec", "pe", "br", "cl", "ar"],
				loadUtils: () => import("intl-tel-input/utils"),
			});
			form = input.form;
			form?.addEventListener("submit", onSubmit, true);
		})();

		return () => {
			cancelado = true;
			form?.removeEventListener("submit", onSubmit, true);
			iti?.destroy();
		};
	});
</script>

<div>
	<label class="block text-sm font-medium text-sand-700" for={name}>{label}</label>
	{#if children}
		{@render children(name)}
	{:else}
		<div class="relative">
			<input
				{...rest}
				bind:this={telEl}
				id={name}
				{name}
				type={isPassword && revealed ? "text" : type}
				{value}
				{required}
				aria-invalid={error ? "true" : undefined}
				aria-describedby={describedBy}
				class="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none {error
					? 'border-danger focus:border-danger'
					: 'border-sand-300 focus:border-brand-600'} {isPassword ? 'pr-11' : ''}"
			/>
			{#if isPassword && hydrated}
				<button
					type="button"
					onclick={() => (revealed = !revealed)}
					aria-label={revealed ? "Ocultar contraseña" : "Mostrar contraseña"}
					aria-pressed={revealed}
					title={revealed ? "Ocultar contraseña" : "Mostrar contraseña"}
					class="absolute inset-y-0 right-0 mt-1 flex items-center rounded-r-md px-3 text-sand-500 transition-colors hover:text-sand-950"
				>
					{#if revealed}
						<EyeOff size={18} aria-hidden="true" />
					{:else}
						<Eye size={18} aria-hidden="true" />
					{/if}
				</button>
			{/if}
		</div>
	{/if}
	{#if hint}
		<p id={hintId} class="mt-1 text-xs text-sand-500">{hint}</p>
	{/if}
	{#if error}
		<p id={errorId} role="alert" class="mt-1 text-xs text-danger">{error}</p>
	{/if}
</div>
