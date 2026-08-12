<!--
	"Sé taller aliado" — the public application page.

	Like /citas, this is one of the two forms in the app that need JavaScript, because Turnstile has
	no no-JS mode and the whole point of the gate is that a script cannot pass it. The <noscript>
	block hands those visitors the phone and WhatsApp instead of a dead form.

	Written for a phone held by somebody standing in their own shop: one column, big tap targets,
	the submit button at the bottom where a thumb reaches.
-->
<script lang="ts">
	import BadgeCheck from "@lucide/svelte/icons/badge-check";
	import Building2 from "@lucide/svelte/icons/building-2";
	import Phone from "@lucide/svelte/icons/phone";
	import UserRound from "@lucide/svelte/icons/user-round";
	import Wrench from "@lucide/svelte/icons/wrench";
	import Button from "$lib/components/Button.svelte";
	import Field from "$lib/components/Field.svelte";
	import { telHref, telefonoFormato, waHref } from "$lib/empresa";

	let { data, form } = $props();

	const v = (name: string) => String(form?.valores?.[name] ?? "");

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";
</script>

<svelte:head>
	<title>Sé taller aliado — Estación 360</title>
	<meta
		name="description"
		content="Estación 360 busca talleres en Hermosillo para trabajar en conjunto. Nosotros conseguimos y cotizamos el trabajo, tú reparas."
	/>
	<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</svelte:head>

<div class="min-h-svh bg-sand-100">
	<header class="border-b border-sand-200 bg-sand-50">
		<nav class="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3" aria-label="Principal">
			<a href="/" class="font-display text-xl tracking-tight text-sand-950">
				ESTACIÓN <span class="text-brand-600">360</span>
			</a>
			<a href="/login" class="ml-auto text-sm font-medium text-sand-600 hover:text-brand-600">Entrar</a>
		</nav>
	</header>

	<main class="mx-auto max-w-3xl px-4 py-10">
		<p class="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
			<BadgeCheck size={14} aria-hidden="true" />
			Red de talleres aliados
		</p>
		<h1 class="font-display mt-3 text-4xl text-sand-950 md:text-5xl">Trabaja con nosotros</h1>
		<p class="mt-3 max-w-xl leading-relaxed text-sand-600">
			Estación 360 recibe la unidad, la diagnostica, la cotiza y responde ante el cliente. Cuando el
			trabajo es lo tuyo, te lo mandamos ya autorizado. Tú te concentras en repararlo bien.
		</p>

		<section class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
			{#each data.beneficios as b (b.titulo)}
				<div class="rounded-lg border border-sand-200 bg-white p-4">
					<p class="font-bold text-sand-950">{b.titulo}</p>
					<p class="mt-1 text-sm leading-relaxed text-sand-600">{b.texto}</p>
				</div>
			{/each}
		</section>

		<section class="mt-8 rounded-lg border border-sand-200 bg-white p-5">
			<h2 class="font-display text-xl text-sand-950">Lo que pedimos</h2>
			<ul class="mt-3 space-y-2">
				{#each data.requisitos as r (r)}
					<li class="flex gap-2 text-sm text-sand-700">
						<BadgeCheck size={16} aria-hidden="true" class="mt-0.5 shrink-0 text-brand-600" />
						<span>{r}</span>
					</li>
				{/each}
			</ul>
			<p class="mt-4 rounded border border-sand-200 bg-sand-50 p-3 text-sm leading-relaxed text-sand-700">
				Cada solicitud la revisa una persona del equipo. Te llamamos para conocerlos y ver el taller
				antes de mandarles la primera unidad. <strong>No cobramos por registrarte ni por aparecer.</strong>
			</p>
		</section>

		<noscript>
			<div class="mt-8 rounded-lg border-2 border-brand-600 bg-white p-5">
				<p class="font-bold text-sand-950">Necesitamos JavaScript para recibir tu solicitud en línea</p>
				<p class="mt-1 text-sm text-sand-600">
					La verificación de seguridad no funciona sin él. Escríbenos y lo hacemos por teléfono:
				</p>
				<p class="mt-3 flex flex-wrap gap-3">
					{#if waHref(data.empresa.telefono)}
						<a
							href={waHref(data.empresa.telefono)}
							class="inline-flex items-center rounded-md bg-whatsapp px-4 py-2.5 font-bold text-white">WhatsApp</a
						>
					{/if}
					{#if telHref(data.empresa.telefono)}
						<a
							href={telHref(data.empresa.telefono)}
							class="inline-flex items-center rounded-md border-2 border-sand-300 px-4 py-2.5 font-bold text-sand-950"
							>{telefonoFormato(data.empresa.telefono)}</a
						>
					{/if}
				</p>
			</div>
		</noscript>

		{#if form?.message}
			<p role="alert" class="mt-8 rounded border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-900">
				{form.message}
			</p>
		{/if}

		<form method="POST" class="mt-8 space-y-6">
			<section class="rounded-lg border border-sand-200 bg-white p-5">
				<h2 class="font-display flex items-center gap-2 text-xl text-sand-950">
					<Building2 size={20} aria-hidden="true" />
					Tu taller
				</h2>
				<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field label="Nombre del taller" name="nombre" required value={v("nombre")} />
					<Field label="Ciudad" name="ciudad" value={v("ciudad")} placeholder="Hermosillo" />
					<div class="sm:col-span-2">
						<Field
							label="Dirección"
							name="direccion"
							value={v("direccion")}
							hint="Calle, número y colonia. Es donde pasaríamos a conocerlos."
						/>
					</div>
					<Field label="RFC (opcional)" name="rfc" value={v("rfc")} />
					<Field label="Sitio web o red social (opcional)" name="sitioWeb" value={v("sitioWeb")} />
					<Field label="Años operando" name="anosOperando" type="number" min="0" max="200" value={v("anosOperando")} />
					<Field label="¿Cuántos trabajan ahí?" name="empleados" type="number" min="0" max="10000" value={v("empleados")} />
				</div>
			</section>

			<section class="rounded-lg border border-sand-200 bg-white p-5">
				<h2 class="font-display flex items-center gap-2 text-xl text-sand-950">
					<Wrench size={20} aria-hidden="true" />
					Qué hacen
				</h2>
				<div class="mt-4">
					<Field label="Especialidades" name="especialidades">
						{#snippet children(id)}
							<textarea
								{id}
								name="especialidades"
								required
								rows="3"
								class={INPUT}
								placeholder="Mecánica general, hojalatería y pintura, transmisiones automáticas, diésel…"
								>{v("especialidades")}</textarea
							>
						{/snippet}
					</Field>
				</div>
				<div class="mt-4">
					<Field label="Algo más que debamos saber (opcional)" name="notas">
						{#snippet children(id)}
							<textarea
								{id}
								name="notas"
								rows="2"
								class={INPUT}
								placeholder="Equipo con el que cuentan, marcas que dominan, horario…">{v("notas")}</textarea
							>
						{/snippet}
					</Field>
				</div>
			</section>

			<section class="rounded-lg border border-sand-200 bg-white p-5">
				<h2 class="font-display flex items-center gap-2 text-xl text-sand-950">
					<UserRound size={20} aria-hidden="true" />
					¿Con quién hablamos?
				</h2>
				<p class="mt-1 text-sm text-sand-600">
					La persona responsable con la que podamos hablar en horario de taller.
				</p>
				<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field label="Nombre" name="contacto" required value={v("contacto")} autocomplete="name" />
					<Field label="Teléfono" name="telefono" type="tel" required value={v("telefono")} autocomplete="tel" />
					<div class="sm:col-span-2">
						<Field label="Correo (opcional)" name="email" type="email" value={v("email")} autocomplete="email" />
					</div>
				</div>
				<p class="mt-4 flex gap-2 rounded border border-sand-200 bg-sand-50 p-3 text-xs leading-relaxed text-sand-600">
					<Phone size={14} aria-hidden="true" class="mt-0.5 shrink-0" />
					Después de aprobarlos pueden registrar más sucursales, cada una con su propio responsable.
				</p>
			</section>

			<div class="cf-turnstile" data-sitekey={data.siteKey} data-language="es"></div>

			<Button full size="lg">Enviar solicitud</Button>
			<p class="text-center text-xs text-sand-500">
				Al enviar aceptas que te contactemos por teléfono o WhatsApp para revisar tu solicitud.
			</p>
		</form>
	</main>
</div>
