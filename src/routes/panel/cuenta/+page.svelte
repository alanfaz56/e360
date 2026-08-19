<script lang="ts">
	import PageHeader from "$lib/components/PageHeader.svelte";
	import Field from "$lib/components/Field.svelte";
	import Button from "$lib/components/Button.svelte";

	let { data, form } = $props();
</script>

<svelte:head><title>Mi cuenta — Estación 360</title></svelte:head>

<PageHeader title="Mi cuenta" description="{data.actor.name} · {data.actor.email} · {data.actor.roleLabel}" />

<div class="max-w-sm">
	<h2 class="font-display mt-6 mb-3 text-lg text-sand-950">Cambiar contraseña</h2>

	<form method="POST" class="space-y-4 rounded-lg border border-sand-200 bg-white p-6">
		{#if form?.message}
			<p role="alert" class="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
				{form.message}
			</p>
		{/if}
		{#if form?.success}
			<p role="status" class="rounded border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-sand-800">
				Contraseña actualizada.
			</p>
		{/if}

		<Field
			label="Contraseña actual"
			name="currentPassword"
			type="password"
			autocomplete="current-password"
			required
		/>
		<Field
			label="Contraseña nueva"
			name="newPassword"
			type="password"
			autocomplete="new-password"
			hint="Al menos {data.minPasswordLength} caracteres."
			required
		/>
		<Field
			label="Confirmar contraseña nueva"
			name="confirm"
			type="password"
			autocomplete="new-password"
			required
		/>

		<p class="text-xs text-sand-500">
			Al cambiarla se cerrará tu sesión en cualquier otro dispositivo o navegador — esta sesión sigue activa.
		</p>

		<Button full>Cambiar contraseña</Button>
	</form>
</div>
