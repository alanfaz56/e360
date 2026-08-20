<script lang="ts">
	let { data } = $props();
</script>

<footer class="bg-sand-950 text-sand-400">
	<div class="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center">
		<div class="w-fit">
			<img
				src="/logo_simple_red.png"
				alt="Estacion 360 Logotipo"
				class="h-24"
			/>
		</div>
		<!-- Talleres are recruited, not advertised to customers: the entrance belongs in the footer,
		     where somebody looking for it will find it, not competing with "agenda tu cita". -->
		<a
			class="text-sm font-medium hover:text-white sm:ml-auto"
			href="/talleres"
		>
			¿Tienes un taller? Trabaja con nosotros
		</a>
		<p class="text-sm">
			Hermosillo, Sonora · <a
				class="hover:text-white"
				href="https://{data.empresa.sitioWeb ?? 'www.estacion360.com'}"
				>{data.empresa.sitioWeb ?? "estacion360.com"}</a
			>
		</p>
	</div>
</footer>
