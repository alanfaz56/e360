<script lang="ts">
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import Field from "$lib/components/Field.svelte";

	let { data, form } = $props();
</script>

<svelte:head><title>Activa tu cuenta — Estación 360</title></svelte:head>

<main class="flex min-h-svh items-center justify-center bg-sand-100 px-4 py-12">
	<div class="w-full max-w-sm">
		<a href="/" class="font-display text-2xl text-sand-950">
			ESTACIÓN <span class="text-brand-600">360</span>
		</a>

		<form method="POST" class="mt-6 space-y-4 rounded-lg border border-sand-200 bg-white p-6">
			<div>
				<h1 class="font-display text-2xl text-sand-950">Activa tu cuenta</h1>
				<dl class="mt-3 space-y-1 text-sm text-sand-600">
					<div class="flex gap-2">
						<dt class="font-medium text-sand-700">Correo:</dt>
						<dd>{data.email}</dd>
					</div>
					<div class="flex items-center gap-2">
						<dt class="font-medium text-sand-700">Rol:</dt>
						<dd><Badge tone="brand">{data.roleLabel}</Badge></dd>
					</div>
				</dl>
			</div>

			{#if form?.message}
				<p role="alert" class="rounded border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
					{form.message}
				</p>
			{/if}

			<Field label="Tu nombre" name="name" required minlength={2} autocomplete="name" value={form?.name ?? ""} />
			<Field
				label="Contraseña"
				name="password"
				type="password"
				required
				minlength={data.minPasswordLength}
				autocomplete="new-password"
				hint={`Mínimo ${data.minPasswordLength} caracteres.`}
			/>
			<Field
				label="Confirma contraseña"
				name="confirm"
				type="password"
				required
				minlength={data.minPasswordLength}
				autocomplete="new-password"
			/>

			<Button full>Crear cuenta</Button>
		</form>
	</div>
</main>
