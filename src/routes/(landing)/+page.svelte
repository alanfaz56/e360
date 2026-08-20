<!--
	Landing — Estación 360.
	ponytail: zero client JS, zero images. Menu/Footer live in the (landing) group layout;
	this stays pure markup + Tailwind tokens so it prerenders to one static HTML file.
-->
<script lang="ts">
	import Button from "$lib/components/Button.svelte";
	import { waHref } from "$lib/empresa";

	let { data } = $props();
</script>

<svelte:head>
	<title>Estación 360 — Sistema de administración para talleres</title>
	<meta
		name="description"
		content="Órdenes de servicio, clientes, vehículos, citas, refacciones y facturación en un solo lugar. Hecho para el taller de Hermosillo, Sonora."
	/>
</svelte:head>

{#snippet feature(title: string, body: string)}
	<div class="rounded-lg border border-sand-200 bg-white p-6 transition-colors hover:border-brand-600">
		<h3 class="font-display text-xl text-sand-950">{title}</h3>
		<p class="mt-2 text-sm leading-relaxed text-sand-600">{body}</p>
	</div>
{/snippet}

{#snippet step(n: string, title: string, body: string)}
	<li class="relative pl-14">
		<span
			class="absolute left-0 top-0 flex size-10 items-center justify-center rounded-full bg-brand-600 font-display text-lg text-white"
			aria-hidden="true">{n}</span
		>
		<h3 class="font-display text-lg text-sand-950">{title}</h3>
		<p class="mt-1 text-sm leading-relaxed text-sand-600">{body}</p>
	</li>
{/snippet}

<a
	href="#contenido"
	class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
>
	Saltar al contenido
</a>

<main id="contenido">
	<!-- Hero -->
	<section class="border-b border-sand-200 bg-sand-100">
		<div class="mx-auto max-w-6xl px-4 py-20 md:py-28">
			<p class="text-sm font-bold uppercase tracking-widest text-brand-600">Hermosillo, Sonora</p>
			<h1 class="font-display mt-4 max-w-3xl text-5xl leading-[0.95] text-sand-950 md:text-7xl">
				Tu taller,<br />en las mejores manos
			</h1>
			<p class="mt-6 max-w-xl text-lg leading-relaxed text-sand-600">
				Órdenes de servicio, clientes, vehículos, citas, refacciones y facturación. Un solo sistema para todo lo
				que entra y sale del taller.
			</p>
			<div class="mt-8 flex flex-wrap gap-3">
				<Button
					href="/citas"
					size="lg">Agendar una cita</Button
				>
				<Button
					href="/login"
					size="lg"
					variant="outline">Entrar al sistema</Button
				>
			</div>
		</div>
	</section>

	<!-- Especialidades del taller -->
	<section class="border-b border-sand-200 bg-sand-950">
		<ul class="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 py-10 text-center md:grid-cols-4">
			{#each ["Carrocería", "Eléctrico", "Enfriamiento", "Frenos"] as area}
				<li class="font-display py-4 text-2xl text-white md:text-3xl">{area}</li>
			{/each}
		</ul>
	</section>

	<!-- Módulos -->
	<section
		id="modulos"
		class="mx-auto max-w-6xl scroll-mt-20 px-4 py-20"
	>
		<h2 class="font-display text-4xl text-sand-950 md:text-5xl">Módulos</h2>
		<p class="mt-3 max-w-xl text-sand-600">
			Todo lo que el mostrador y la bahía necesitan, sin hojas de cálculo sueltas.
		</p>
		<div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{@render feature(
				"Órdenes de servicio",
				"Abre la orden, asigna técnico, registra refacciones y mano de obra. Estado en vivo desde recepción hasta entrega.",
			)}
			{@render feature(
				"Clientes y vehículos",
				"Placas, VIN, kilometraje y el historial completo de cada unidad. Sabes qué se le hizo y cuándo.",
			)}
			{@render feature(
				"Agenda de citas",
				"Calendario por bahía y por técnico. Evita empalmes y ve la carga real de la semana.",
			)}
			{@render feature(
				"Refacciones e inventario",
				"Existencias, mínimos y costo. Descuento automático al cerrar la orden de servicio.",
			)}
			{@render feature(
				"Cotizaciones y facturación",
				"Cotiza, autoriza y factura sin recapturar. El presupuesto se convierte en orden con un clic.",
			)}
			{@render feature(
				"Reportes",
				"Ingresos, servicios más vendidos y productividad por técnico. Números para decidir, no para adivinar.",
			)}
		</div>
	</section>

	<!-- Flujo -->
	<section
		id="flujo"
		class="scroll-mt-20 border-y border-sand-200 bg-white"
	>
		<div class="mx-auto max-w-6xl px-4 py-20">
			<h2 class="font-display text-4xl text-sand-950 md:text-5xl">Cómo funciona</h2>
			<ol class="mt-10 grid gap-10 md:grid-cols-3">
				{@render step(
					"1",
					"Recepción",
					"Se registra el vehículo y el motivo de entrada. Si el cliente ya existe, su historial aparece solo.",
				)}
				{@render step(
					"2",
					"Diagnóstico y autorización",
					"El técnico carga hallazgos y refacciones. Sale la cotización y el cliente autoriza.",
				)}
				{@render step(
					"3",
					"Entrega y facturación",
					"Se cierra la orden, se descuenta inventario y se factura. Todo queda en el expediente.",
				)}
			</ol>
		</div>
	</section>

	<!-- CTA -->
	<section
		id="contacto"
		class="scroll-mt-20 bg-brand-600"
	>
		<div class="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 md:flex-row md:items-center">
			<div>
				<h2 class="font-display text-4xl text-white md:text-5xl">¿Listo para arrancar?</h2>
				<p class="mt-3 max-w-lg text-brand-100">Agenda tu servicio en línea o escríbenos por WhatsApp.</p>
			</div>
			<div class="flex flex-wrap gap-3 md:ml-auto">
				<Button
					href="/citas"
					size="lg"
					variant="invert">Agendar cita</Button
				>
				{#if waHref(data.empresa.telefono)}
					<a
						href={waHref(data.empresa.telefono)}
						class="inline-flex items-center justify-center rounded-md border-2 border-white px-6 py-3 font-bold text-white transition-colors hover:bg-white hover:text-brand-700"
					>
						WhatsApp
					</a>
				{/if}
			</div>
		</div>
	</section>
</main>
