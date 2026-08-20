<script lang="ts">
	// Compact header on scroll: nothing to track before hydration, so this starts false and only
	// ever flips client-side — a no-JS visitor just keeps the full-height header, never a broken one.
	let compacto = $state(false);

	$effect(() => {
		const alScrollear = () => (compacto = window.scrollY > 8);
		alScrollear();
		window.addEventListener("scroll", alScrollear, { passive: true });
		return () => window.removeEventListener("scroll", alScrollear);
	});
</script>

<header
	class="sticky top-0 z-40 border-b border-sand-200 bg-sand-50/95 backdrop-blur transition-[height] duration-300 ease-out {compacto
		? 'h-14'
		: 'h-20'}"
>
	<nav
		class="mx-auto flex h-full max-w-6xl items-center gap-6 px-4"
		aria-label="Principal"
	>
		<a
			href="/"
			class="font-display text-xl tracking-tight text-sand-950"
		>
			<img
				src="/logo_simple_red.png"
				alt="Estacion 360 Logotipo"
				class="mx-auto transition-[height] duration-300 ease-out {compacto ? 'h-10' : 'h-16'}"
			/>
		</a>
		<ul class="ml-auto hidden items-center gap-6 text-sm font-medium text-sand-600 md:flex">
			<li>
				<a
					class="hover:text-brand-600"
					href="#modulos">Módulos</a
				>
			</li>
			<li>
				<a
					class="hover:text-brand-600"
					href="#flujo">Cómo funciona</a
				>
			</li>
			<!-- <li>
				<a
					class="hover:text-brand-600"
					href="#contacto">Contacto</a
				>
			</li> -->
			<li>
				<a
					class="hover:text-brand-600"
					href="/login">Entrar</a
				>
			</li>
		</ul>
		<a
			href="/citas"
			class="ml-auto rounded-md bg-brand-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-700 md:ml-0"
		>
			Agendar cita
		</a>
	</nav>
</header>
