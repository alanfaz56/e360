<!--
	Public appointment request. The only page in the app an anonymous visitor can write from.

	This is the ONE form that needs JavaScript: Turnstile has no no-JS mode, and the whole point
	of the gate is that a script cannot pass it. The <noscript> block below gives those visitors
	the phone and WhatsApp instead, so nobody is left staring at a dead form. Every /panel form
	stays no-JS, Rule 7 intact.
-->
<script lang="ts">
	import CalendarDays from "@lucide/svelte/icons/calendar-days";
	import Truck from "@lucide/svelte/icons/truck";
	import Wrench from "@lucide/svelte/icons/wrench";
	import Phone from "@lucide/svelte/icons/phone";
	import Button from "$lib/components/Button.svelte";
	import Field from "$lib/components/Field.svelte";
	import { CITA_TIPO_DEFAULT } from "$lib/citas";
	import { telHref, telefonoFormato, waHref } from "$lib/empresa";

	let { data, form } = $props();

	const v = (name: string) => String(form?.valores?.[name] ?? "");

	// Which fields show. Derived-with-override so the server-rendered HTML is already right.
	// Defaults to recolección — the shop would rather go get the vehicle.
	// `||`, not `??`: v() returns "" when the field is absent, and "" is not nullish.
	let tipoElegido = $state<string | null>(null);
	const tipo = $derived(tipoElegido ?? (v("tipo") || CITA_TIPO_DEFAULT));

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";
</script>

<svelte:head>
	<title>Agendar una cita — Estación 360</title>
	<meta
		name="description"
		content="Agenda tu servicio en Estación 360, Hermosillo. Llévanos tu unidad o pide que pasemos por ella."
	/>
	<!-- Turnstile renders the widget into the div below via its implicit `cf-turnstile` class. -->
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
		<h1 class="font-display text-4xl text-sand-950 md:text-5xl">Agenda tu cita</h1>
		<p class="mt-3 max-w-xl text-sand-600">
			Dinos qué necesita tu unidad y cuándo te conviene. Nosotros nos encargamos del resto.
		</p>

		<!--
			Sets the expectation before the form, not after: nothing is final until a person from
			the shop talks to the customer. Repeated on /citas/gracias so it survives the redirect.
		-->
		<div class="mt-6 flex gap-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
			<Phone size={20} class="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
			<div class="text-sm text-sand-800">
				<p class="font-bold">Siempre confirmamos contigo antes de cualquier cosa</p>
				<p class="mt-1 leading-relaxed">
					Nos comunicamos por teléfono, WhatsApp o correo para confirmar la hora y el servicio.
					Nada se cobra ni se mueve sin tu visto bueno.
					{#if telHref(data.empresa.telefono)}
						Si prefieres,
						<a class="font-medium text-brand-700 underline" href={telHref(data.empresa.telefono)}>llámanos</a>
						y lo agendamos contigo en el momento.
					{/if}
				</p>
			</div>
		</div>

		<noscript>
			<div class="mt-6 rounded-lg border-2 border-brand-600 bg-white p-5">
				<p class="font-bold text-sand-950">Necesitamos JavaScript para agendar en línea</p>
				<p class="mt-1 text-sm text-sand-600">
					La verificación de seguridad no funciona sin él. Escríbenos y te agendamos igual:
				</p>
				<p class="mt-3 flex flex-wrap gap-3">
					{#if waHref(data.empresa.telefono)}
						<a
							href={waHref(data.empresa.telefono)}
							class="inline-flex items-center rounded-md bg-whatsapp px-4 py-2 font-bold text-white"
						>
							WhatsApp
						</a>
					{/if}
					{#if telHref(data.empresa.telefono)}
						<a
							href={telHref(data.empresa.telefono)}
							class="inline-flex items-center rounded-md border-2 border-sand-300 px-4 py-2 font-bold text-sand-950"
						>
							{telefonoFormato(data.empresa.telefono)}
						</a>
					{/if}
				</p>
			</div>
		</noscript>

		{#if form?.message}
			<p role="alert" class="mt-6 rounded border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-900">
				{form.message}
			</p>
		{/if}

		<form method="POST" class="mt-6 space-y-6">
			<section class="rounded-lg border border-sand-200 bg-white p-5">
				<h2 class="font-display flex items-center gap-2 text-xl text-sand-950">
					<Wrench size={20} aria-hidden="true" />
					Tu unidad
				</h2>
				<div class="mt-4 grid gap-4 sm:grid-cols-2">
					<Field label="Tu nombre" name="nombre" required value={v("nombre")} autocomplete="name" />
					<Field label="Teléfono" name="telefono" type="tel" required value={v("telefono")} autocomplete="tel" />
					<Field label="Correo (opcional)" name="email" type="email" value={v("email")} autocomplete="email" />
					<Field label="Placas (opcional)" name="placas" value={v("placas")} />
					<Field label="Marca" name="marca" value={v("marca")} placeholder="Toyota" />
					<Field label="Modelo" name="modelo" value={v("modelo")} placeholder="Hilux" />
					<Field label="Año (opcional)" name="anio" type="number" value={v("anio")} min="1900" max="2030" />
				</div>
				<div class="mt-4">
					<Field label="¿Qué necesita?" name="motivo">
						{#snippet children(id)}
							<textarea
								{id}
								name="motivo"
								required
								rows="3"
								class={INPUT}
								placeholder="Se escucha un ruido al frenar, servicio de 10 mil km, revisión de aire…"
								>{v("motivo")}</textarea
							>
						{/snippet}
					</Field>
				</div>
			</section>

			<section class="rounded-lg border border-sand-200 bg-white p-5">
				<h2 class="font-display flex items-center gap-2 text-xl text-sand-950">
					<CalendarDays size={20} aria-hidden="true" />
					Cuándo
				</h2>
				<div class="mt-4 grid gap-4 sm:grid-cols-2">
					<Field label="Día" name="fecha" type="date" required value={v("fecha")} min={data.minima} max={data.maxima} />
					<Field label="Prefiero" name="franja">
						{#snippet children(id)}
							<select {id} name="franja" required class={INPUT}>
								{#each data.franjas as f (f.value)}
									<option value={f.value} selected={v("franja") === f.value}>
										{f.label} ({f.desde}–{f.hasta})
									</option>
								{/each}
							</select>
						{/snippet}
					</Field>
				</div>
				<p class="mt-2 text-xs text-sand-500">
					Te confirmamos la hora exacta dentro de esa franja cuando revisemos tu solicitud.
				</p>
			</section>

			<section class="rounded-lg border border-sand-200 bg-white p-5">
				<h2 class="font-display flex items-center gap-2 text-xl text-sand-950">
					<Truck size={20} aria-hidden="true" />
					¿Cómo llega la unidad?
				</h2>
				<div class="mt-4 space-y-2">
					{#each data.tipos as t (t.value)}
						<label class="flex cursor-pointer items-start gap-2.5 rounded border border-sand-200 p-3 hover:border-brand-600">
							<input
								type="radio"
								name="tipo"
								value={t.value}
								checked={tipo === t.value}
								onchange={() => (tipoElegido = t.value)}
								required
								class="mt-0.5 size-4 shrink-0 accent-brand-600"
							/>
							<span>
								<span class="text-sm font-medium text-sand-950">{t.label}</span>
								<span class="block text-xs text-sand-500">{t.descripcion}</span>
							</span>
						</label>
					{/each}
				</div>

				{#if tipo === "recoleccion"}
					<div class="mt-4">
						<Field
							label="¿Dónde recogemos la unidad?"
							name="direccionRecoleccion"
							required
							value={v("direccionRecoleccion")}
							hint="Calle, número y colonia. Confirmamos por teléfono antes de salir."
						/>
					</div>
				{/if}
			</section>

			<div class="cf-turnstile" data-sitekey={data.siteKey} data-language="es"></div>

			<Button full size="lg">Solicitar cita</Button>
			<p class="text-center text-xs text-sand-500">
				Al enviar aceptas que te contactemos por teléfono o WhatsApp para confirmar.
			</p>
		</form>
	</main>
</div>
