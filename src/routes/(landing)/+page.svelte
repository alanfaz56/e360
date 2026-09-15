<!--
	Landing — Estación 360. Promoción del taller a clientes finales y flotillas (no es un SaaS).
	ponytail: zero client JS, zero imágenes nuevas — los "mockups" (bitácora, seguimiento) son
	markup + tokens Tailwind, así la página sigue prerenderizando a un solo HTML estático.
-->
<script lang="ts">
	import Button from "$lib/components/Button.svelte";
	import { telHref, telefonoFormato, waHref } from "$lib/empresa";

	let { data } = $props();

	// ponytail: dato público de marketing, no vive en empresa_config (que sólo guarda
	// teléfono y sitio web). Si algún día se edita desde el panel, muévelo allá.
	const CORREO = "estacion360taller@gmail.com";
</script>

<svelte:head>
	<title>Estación 360 — Taller integral en Hermosillo, Sonora</title>
	<meta
		name="description"
		content="Taller integral en Hermosillo, Sonora. Motor, transmisión, aire acondicionado, suspensión y sistemas eléctricos con técnicos especializados. Bitácora del vehículo, garantía por escrito y seguimiento en línea. Agenda tu cita."
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
				Tu carro,<br />con el especialista correcto
			</h1>
			<p class="mt-6 max-w-xl text-lg leading-relaxed text-sand-600">
				Taller integral: control técnico y reparaciones correctivas. Te decimos qué tiene tu unidad, cuánto
				cuesta y cuántos días de garantía lleva. Sigues el avance en línea, desde tu teléfono.
			</p>
			<div class="mt-8 flex flex-wrap gap-3">
				<Button
					href="/citas"
					size="lg">Agendar una cita</Button
				>
				<Button
					href="#contacto"
					size="lg"
					variant="outline">Hablar con nosotros</Button
				>
			</div>
		</div>
	</section>

	<!-- Especialidades: técnicos especializados por área -->
	<section class="border-b border-sand-200 bg-sand-950">
		<ul class="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 py-10 text-center md:grid-cols-3 lg:grid-cols-6">
			{#each ["Motor", "Transmisión", "A/C", "Suspensión", "Eléctrico", "Servicios"] as area}
				<li class="font-display py-4 text-2xl text-white md:text-3xl">{area}</li>
			{/each}
		</ul>
	</section>

	<!-- Nosotros -->
	<section
		id="nosotros"
		class="mx-auto max-w-6xl scroll-mt-20 px-4 py-20"
	>
		<h2 class="font-display text-4xl text-sand-950 md:text-5xl">Nosotros</h2>
		<div class="mt-8 grid gap-10 md:grid-cols-[1.2fr_1fr]">
			<div class="space-y-4 text-lg leading-relaxed text-sand-600">
				<p>
					Somos un taller integral en Hermosillo enfocado en <strong class="text-sand-950"
						>control técnico</strong
					>,
					<strong class="text-sand-950">reparaciones correctivas</strong> y
					<strong class="text-sand-950">respaldo para empresas y flotillas</strong>.
				</p>
				<p>
					Te acompañamos durante todo el proceso y te incluimos en cada decisión sobre tu unidad. Nada se toca
					sin que lo autorices.
				</p>
			</div>
			<dl class="space-y-4 rounded-lg border border-sand-200 bg-white p-6 text-sm">
				<div>
					<dt class="font-bold uppercase tracking-wide text-brand-600">Dónde estamos</dt>
					<dd class="mt-1 text-sand-600">Camelia 539, Col. Las Torres, Hermosillo, Sonora.</dd>
				</div>
				{#if data.empresa.telefono}
					<div>
						<dt class="font-bold uppercase tracking-wide text-brand-600">Teléfono</dt>
						<dd class="mt-1">
							<a
								class="text-sand-600 hover:text-brand-600"
								href={telHref(data.empresa.telefono)}>{telefonoFormato(data.empresa.telefono)}</a
							>
						</dd>
					</div>
				{/if}
				<div>
					<dt class="font-bold uppercase tracking-wide text-brand-600">Correo</dt>
					<dd class="mt-1">
						<a
							class="break-all text-sand-600 hover:text-brand-600"
							href="mailto:{CORREO}">{CORREO}</a
						>
					</dd>
				</div>
				{#if waHref(data.empresa.telefono)}
					<a
						href={waHref(data.empresa.telefono)}
						class="inline-flex w-full items-center justify-center rounded-md bg-whatsapp px-4 py-2.5 font-bold text-white transition-opacity hover:opacity-90"
					>
						Escríbenos por WhatsApp
					</a>
				{/if}
			</dl>
		</div>
	</section>

	<!-- Fortalezas -->
	<section
		id="fortalezas"
		class="scroll-mt-20 border-y border-sand-200 bg-white"
	>
		<div class="mx-auto max-w-6xl px-4 py-20">
			<h2 class="font-display text-4xl text-sand-950 md:text-5xl">Por qué con nosotros</h2>
			<p class="mt-3 max-w-xl text-sand-600">El trabajo correcto, con el técnico correcto, a la primera.</p>
			<div class="mt-10 grid gap-4 sm:grid-cols-2">
				{@render feature(
					"Red estratégica de talleres",
					"Asignamos cada unidad a un especialista por marca y modelo, no al primero que esté libre.",
				)}
				{@render feature(
					"Técnicos especializados por área",
					"Motor, transmisión, aire acondicionado, suspensión, sistemas eléctricos y servicios.",
				)}
				{@render feature(
					"Menos retrabajos y garantías",
					"La asignación correcta del trabajo reduce regresos y optimiza los tiempos de entrega.",
				)}
				{@render feature(
					"Refaccionaria de cabecera",
					"Calidad, precios competitivos, entregas prioritarias y transparencia entre refacción genérica u original.",
				)}
			</div>
		</div>
	</section>

	<!-- Bitácora del vehículo -->
	<section
		id="bitacora"
		class="mx-auto max-w-6xl scroll-mt-20 px-4 py-20"
	>
		<div class="grid items-start gap-12 md:grid-cols-2">
			<div>
				<h2 class="font-display text-4xl text-sand-950 md:text-5xl">Bitácora del vehículo</h2>
				<div class="mt-6 space-y-4 leading-relaxed text-sand-600">
					<p>
						Te entregamos el diagnóstico y la orden final en una bitácora técnica con el historial completo
						de la unidad, para que sepas con claridad qué proceso seguirá tu vehículo en el taller.
					</p>
					<p class="font-medium text-sand-950">
						Si manejas flotilla, la bitácora es el respaldo histórico de cada unidad y facilita aclaraciones
						y seguimientos futuros.
					</p>
					<p>
						La bitácora final incluye de manera explícita los <strong class="text-sand-950"
							>días de garantía</strong
						> aplicables al trabajo realizado.
					</p>
				</div>
			</div>

			<!-- Mockup de la bitácora: representación del documento, sin datos de clientes reales. -->
			<figure class="overflow-hidden rounded-lg border border-sand-200 bg-white shadow-sm">
				<figcaption class="font-display bg-sand-950 px-5 py-3 text-center text-xl text-white">
					Bitácora de vehículo
				</figcaption>
				<div class="space-y-4 p-5 text-xs">
					<div class="flex flex-wrap items-end gap-4">
						<span class="rounded bg-sand-950 px-3 py-1 font-bold uppercase text-white">Entrada</span>
						<dl class="ml-auto flex gap-6 text-sand-600">
							<div>
								<dt class="uppercase tracking-wide text-sand-500">Técnico</dt>
								<dd
									class="mt-1 h-2.5 w-24 rounded bg-sand-100"
									aria-hidden="true"
								></dd>
							</div>
							<div>
								<dt class="uppercase tracking-wide text-sand-500">Fecha</dt>
								<dd
									class="mt-1 h-2.5 w-20 rounded bg-sand-100"
									aria-hidden="true"
								></dd>
							</div>
						</dl>
					</div>
					<dl class="grid grid-cols-2 gap-3 border-t border-sand-200 pt-3">
						<div>
							<dt class="uppercase tracking-wide text-sand-500">Cliente</dt>
							<dd
								class="mt-1 h-2.5 w-full rounded bg-sand-100"
								aria-hidden="true"
							></dd>
						</div>
						<div>
							<dt class="uppercase tracking-wide text-sand-500">Unidad</dt>
							<dd
								class="mt-1 h-2.5 w-full rounded bg-sand-100"
								aria-hidden="true"
							></dd>
						</div>
					</dl>
					<div>
						<p class="font-bold uppercase text-sand-950">Diagnóstico</p>
						<div
							class="mt-2 space-y-1.5"
							aria-hidden="true"
						>
							<div class="h-2 w-full rounded bg-sand-100"></div>
							<div class="h-2 w-11/12 rounded bg-sand-100"></div>
							<div class="h-2 w-4/5 rounded bg-sand-100"></div>
						</div>
					</div>
					<div>
						<p class="font-bold uppercase text-sand-950">Procedimiento</p>
						<ul class="mt-2 space-y-1.5 text-sand-600">
							{#each ["Revisión del conjunto", "Evaluación de componentes", "Conclusión técnica"] as linea}
								<li class="flex items-center gap-2">
									<span
										class="size-1.5 shrink-0 rounded-full bg-brand-600"
										aria-hidden="true"
									></span>
									{linea}
								</li>
							{/each}
						</ul>
					</div>
					<p class="rounded bg-sand-100 px-3 py-2 font-bold uppercase text-sand-950">
						Días de garantía: indicados en la orden final
					</p>
				</div>
			</figure>
		</div>
	</section>

	<!-- Atención personalizada -->
	<section
		id="atencion"
		class="scroll-mt-20 border-y border-sand-200 bg-white"
	>
		<div class="mx-auto max-w-6xl px-4 py-20">
			<h2 class="font-display text-4xl text-sand-950 md:text-5xl">Atención personalizada</h2>
			<div class="mt-8 grid gap-10 md:grid-cols-2">
				<div class="space-y-4 leading-relaxed text-sand-600">
					<p>
						Tienes un canal directo con el taller: resolvemos dudas, coordinamos el ingreso de tu unidad y
						te avisamos de cada avance durante todo el proceso.
					</p>
					<p>Sin perseguir a nadie por teléfono para saber cómo va tu carro.</p>
				</div>
				<ul class="grid gap-3 sm:grid-cols-2">
					{#each ["Un solo contacto", "Coordinación de ingreso", "Avisos oportunos", "Respuesta por WhatsApp"] as punto}
						<li
							class="font-display rounded-lg border border-sand-200 bg-sand-50 px-4 py-5 text-lg text-sand-950"
						>
							{punto}
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</section>

	<!-- Mantenimiento en tiempo real -->
	<section
		id="seguimiento"
		class="mx-auto max-w-6xl scroll-mt-20 px-4 py-20"
	>
		<div class="grid items-start gap-12 md:grid-cols-2">
			<div>
				<h2 class="font-display text-4xl text-sand-950 md:text-5xl">Mantenimiento en tiempo real</h2>
				<div class="mt-6 space-y-4 leading-relaxed text-sand-600">
					<p>
						Te mandamos un enlace para consultar el avance y el estatus de tu vehículo en cada etapa. Las
						actualizaciones del trabajo se registran en tiempo real.
					</p>
					<p>
						Con fotos de las refacciones que se compraron e instalaron y del trabajo realizado. Ves en qué
						se fue tu dinero.
					</p>
				</div>
			</div>

			<!-- Mockup de la pantalla de seguimiento: estructura real, sin datos de clientes. -->
			<figure class="overflow-hidden rounded-lg border border-sand-200 bg-white text-xs shadow-sm">
				<div class="grid grid-cols-2 gap-3 border-b border-sand-200 px-5 py-3 sm:grid-cols-4">
					{#each ["Recepción", "Recibió", "Estatus", "Folio"] as rotulo}
						<div>
							<p class="uppercase tracking-wide text-sand-500">{rotulo}</p>
							{#if rotulo === "Estatus"}
								<p class="mt-1 font-bold uppercase text-brand-600">Recibido</p>
							{:else}
								<p
									class="mt-1 h-2.5 w-full rounded bg-sand-100"
									aria-hidden="true"
								></p>
							{/if}
						</div>
					{/each}
				</div>
				<div class="grid gap-3 p-5 sm:grid-cols-2">
					<dl class="rounded border border-sand-200 p-3">
						<p class="font-bold uppercase text-sand-950">Unidad</p>
						{#each ["Marca", "Modelo", "Año", "Kilometraje", "Serie"] as campo}
							<div class="mt-2 flex items-center gap-2">
								<dt class="w-20 shrink-0 text-sand-500">{campo}</dt>
								<dd
									class="h-2.5 w-full rounded bg-sand-100"
									aria-hidden="true"
								></dd>
							</div>
						{/each}
					</dl>
					<dl class="rounded border border-sand-200 p-3">
						<p class="font-bold uppercase text-sand-950">Cliente</p>
						{#each ["Nombre", "Teléfono"] as campo}
							<div class="mt-2 flex items-center gap-2">
								<dt class="w-20 shrink-0 text-sand-500">{campo}</dt>
								<dd
									class="h-2.5 w-full rounded bg-sand-100"
									aria-hidden="true"
								></dd>
							</div>
						{/each}
						<p class="mt-4 font-bold uppercase text-sand-950">Firma</p>
						<div
							class="mt-2 h-10 rounded border border-dashed border-sand-300"
							aria-hidden="true"
						></div>
					</dl>
				</div>
				<figcaption class="border-t border-sand-200 px-5 pb-5 pt-3">
					<p class="font-bold uppercase text-sand-950">Evidencia del trabajo</p>
					<div
						class="mt-2 grid grid-cols-4 gap-2"
						aria-hidden="true"
					>
						{#each [1, 2, 3, 4] as _}
							<div class="aspect-[4/3] rounded bg-sand-200"></div>
						{/each}
					</div>
				</figcaption>
			</figure>
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
					"Recepción y bitácora",
					"Se registra la unidad y el motivo de entrada. Arranca la bitácora con el historial del vehículo.",
				)}
				{@render step(
					"2",
					"Diagnóstico y autorización",
					"El especialista carga hallazgos y refacciones. Recibes la cotización y nada se toca hasta que la autorices.",
				)}
				{@render step(
					"3",
					"Entrega con garantía",
					"Se cierra el trabajo con evidencia y la orden final indica los días de garantía aplicables.",
				)}
			</ol>
		</div>
	</section>

	<!-- Flotillas y empresas -->
	<section
		id="flotillas"
		class="scroll-mt-20 bg-sand-950"
	>
		<div class="mx-auto max-w-6xl px-4 py-20">
			<h2 class="font-display text-4xl text-white md:text-5xl">¿Tienes flotilla?</h2>
			<p class="mt-3 max-w-2xl text-lg text-sand-400">
				Somos tu respaldo externo para los problemas que cuestan dinero, tiempo y reputación. Tus unidades
				trabajando, no paradas.
			</p>
			<ul class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each ["Historial por unidad, para aclaraciones y seguimientos", "Un mismo proceso para toda la flotilla", "Avance en tiempo real de cada vehículo en taller", "Prioridad de entrega con refaccionaria de cabecera", "Un solo contacto para coordinar ingresos"] as beneficio}
					<li class="rounded-lg border border-sand-800 bg-sand-900 p-5 text-sand-100">{beneficio}</li>
				{/each}
			</ul>
			<div class="mt-8">
				<Button
					href="#contacto"
					size="lg"
					variant="invert">Cotizar para mi flotilla</Button
				>
			</div>
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
