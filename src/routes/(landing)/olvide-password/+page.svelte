<script lang="ts">
	import MailCheck from "@lucide/svelte/icons/mail-check";
	import Button from "$lib/components/Button.svelte";
	import Field from "$lib/components/Field.svelte";

	let { form } = $props();
</script>

<svelte:head><title>Olvidé mi contraseña — Estación 360</title></svelte:head>

<main class="flex h-[calc(100dvh-5rem)] items-center justify-center overflow-y-auto bg-sand-100 px-4 py-6">
	<div class="w-full max-w-sm">
		{#if form?.enviado}
			<div class="space-y-4 rounded-lg border border-sand-200 bg-white p-6">
				<p class="flex items-center gap-2 text-sm font-bold text-ok">
					<MailCheck size={18} aria-hidden="true" />
					Revisa tu correo
				</p>
				<p class="text-sm text-sand-700">
					Si <strong>{form.email}</strong> tiene una cuenta, te mandamos un link para restablecer tu
					contraseña. Vence pronto — pídelo de nuevo si no llega en unos minutos.
				</p>
				<Button href="/login" variant="outline" full>Volver a entrar</Button>
			</div>
		{:else}
			<form method="POST" class="space-y-4 rounded-lg border border-sand-200 bg-white p-6">
				<div>
					<h1 class="font-display text-2xl text-sand-950">Olvidé mi contraseña</h1>
					<p class="mt-1 text-sm text-sand-600">Te mandamos un link para restablecerla.</p>
				</div>

				{#if form?.message}
					<p role="alert" class="rounded border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
						{form.message}
					</p>
				{/if}

				<Field label="Correo" name="email" type="email" autocomplete="username" required value={form?.email ?? ""} />

				<Button full>Mandar link</Button>
			</form>
		{/if}

		<p class="mt-4 text-center text-sm text-sand-600">
			<a href="/login" class="underline">Volver a entrar</a>
		</p>
	</div>
</main>
