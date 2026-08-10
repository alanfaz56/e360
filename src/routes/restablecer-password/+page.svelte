<script lang="ts">
	import ShieldAlert from "@lucide/svelte/icons/shield-alert";
	import Button from "$lib/components/Button.svelte";
	import Field from "$lib/components/Field.svelte";

	let { data, form } = $props();
</script>

<svelte:head><title>Restablecer contraseña — Estación 360</title></svelte:head>

<main class="flex min-h-svh items-center justify-center bg-sand-100 px-4 py-12">
	<div class="w-full max-w-sm">
		<a href="/" class="font-display text-2xl text-sand-950">
			ESTACIÓN <span class="text-brand-600">360</span>
		</a>

		{#if data.invalido || !data.token}
			<div class="mt-6 space-y-4 rounded-lg border border-sand-200 bg-white p-6">
				<p class="flex items-center gap-2 text-sm font-bold text-danger">
					<ShieldAlert size={18} aria-hidden="true" />
					Link vencido o inválido
				</p>
				<p class="text-sm text-sand-700">Pide uno nuevo — los links de restablecer contraseña vencen rápido.</p>
				<Button href="/olvide-password" full>Pedir un link nuevo</Button>
			</div>
		{:else}
			<form method="POST" class="mt-6 space-y-4 rounded-lg border border-sand-200 bg-white p-6">
				<div>
					<h1 class="font-display text-2xl text-sand-950">Nueva contraseña</h1>
				</div>

				{#if form?.message}
					<p role="alert" class="rounded border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
						{form.message}
					</p>
				{/if}

				<input type="hidden" name="token" value={data.token} />
				<Field label="Contraseña nueva" name="password" type="password" autocomplete="new-password" required />
				<Field label="Confirmar contraseña" name="confirmar" type="password" autocomplete="new-password" required />

				<Button full>Restablecer contraseña</Button>
			</form>
		{/if}
	</div>
</main>
