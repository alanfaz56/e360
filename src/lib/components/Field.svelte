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

	let {
		label,
		name,
		type = "text",
		hint,
		value = "",
		required = false,
		children,
		...rest
	}: {
		label: string;
		name: string;
		type?: string;
		hint?: string;
		value?: string;
		required?: boolean;
		children?: Snippet<[string]>;
		[key: string]: unknown;
	} = $props();

	const isPassword = $derived(type === "password");
	let revealed = $state(false);

	// The toggle is useless without JavaScript, so it is only rendered once the component
	// has hydrated — $effect never runs during SSR. No dead button for no-JS users.
	let hydrated = $state(false);
	$effect(() => {
		hydrated = true;
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
				id={name}
				{name}
				type={isPassword && revealed ? "text" : type}
				{value}
				{required}
				class="mt-1 w-full rounded-md border border-sand-300 px-3 py-2 focus:border-brand-600 focus:outline-none {isPassword
					? 'pr-11'
					: ''}"
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
		<p class="mt-1 text-xs text-sand-500">{hint}</p>
	{/if}
</div>
