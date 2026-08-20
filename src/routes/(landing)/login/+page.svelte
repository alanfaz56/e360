<script lang="ts">
	import Lock from "@lucide/svelte/icons/lock";
	import Button from "$lib/components/Button.svelte";
	import Field from "$lib/components/Field.svelte";

	let { form } = $props();
</script>

<svelte:head><title>Entrar — Estación 360</title></svelte:head>

<main class="flex h-[calc(100dvh-5rem)] items-center justify-center overflow-y-auto bg-sand-100 px-4 py-6">
	<div class="w-full max-w-sm">
		<form method="POST" class="space-y-4 rounded-lg border border-sand-200 bg-white p-6">
			<div>
				<h1 class="font-display text-2xl text-sand-950">Entrar</h1>
				<p class="mt-1 text-sm text-sand-600">Acceso solo por invitación.</p>
			</div>

			{#if form?.locked}
				<div role="alert" class="rounded border border-brand-300 bg-brand-50 px-3 py-3">
					<p class="flex items-center gap-2 text-sm font-bold text-brand-900">
						<Lock size={16} aria-hidden="true" />
						{form.message}
					</p>
					{#if form.reason}
						<p class="mt-1.5 text-sm text-brand-900">{form.reason}</p>
					{/if}
					<p class="mt-2 text-xs text-sand-600">
						Contacta a un administrador de Estación 360 para recuperar tu acceso.
					</p>
				</div>
			{:else if form?.message}
				<p role="alert" class="rounded border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
					{form.message}
				</p>
			{/if}

			<Field label="Correo" name="email" type="email" autocomplete="username" required value={form?.email ?? ""} />
			<Field label="Contraseña" name="password" type="password" autocomplete="current-password" required />
			<p class="-mt-2 text-right text-xs">
				<a href="/olvide-password" class="text-sand-600 underline hover:text-sand-800">¿Olvidaste tu contraseña?</a>
			</p>

			<label class="flex items-start gap-2.5 text-sm text-sand-700">
				<input
					type="checkbox"
					name="remember"
					checked={form?.remember ?? true}
					class="mt-0.5 size-4 shrink-0 rounded border-sand-300 accent-brand-600"
				/>
				<span>
					Recordar mi sesión 30 días en este dispositivo
					<span class="mt-0.5 block text-xs text-sand-500">
						No guardamos tu contraseña. Si lo desmarcas, tu sesión se cierra al cerrar el
						navegador. No lo actives en equipos compartidos.
					</span>
				</span>
			</label>

			<Button full>Entrar</Button>
		</form>

		<p class="mt-4 text-center text-sm text-sand-600">
			¿No tienes cuenta? Pídele una invitación a tu Admin o Gerente.
		</p>
	</div>
</main>
