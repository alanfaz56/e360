<script lang="ts">
	import CalendarDays from "@lucide/svelte/icons/calendar-days";
	import Button from "$lib/components/Button.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import StatCard from "$lib/components/StatCard.svelte";

	let { data } = $props();

	// Greeting by the shop's clock, not the viewer's — same rule the agenda follows. A Gerente on a
	// laptop set to CDMX gets the counter's morning, not their own.
	const hora = Number(
		new Intl.DateTimeFormat("es-MX", { timeZone: "America/Hermosillo", hour: "numeric", hour12: false }).format(
			new Date(),
		),
	);
	const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
	const primerNombre = $derived(data.nombre.split(" ")[0]);
</script>

<svelte:head><title>Inicio — Estación 360</title></svelte:head>

<PageHeader
	title="{saludo}, {primerNombre}"
	description="Cómo va el taller ahora mismo."
>
	{#snippet actions()}
		{#if data.puedeAgenda}
			<Button
				href="/panel/agenda"
				variant="outline"
			>
				<CalendarDays
					size={18}
					aria-hidden="true"
				/>
				Ver agenda
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<!--
	KPIs by role. Each block only exists if the caller can already open its data, so nobody sees a
	number they cannot click through to — and every card carries an href, because a number nobody
	can act on is decoration.

	Mobile-first: one column on a phone (where the counter actually stands), two from `sm`, four
	from `lg`. Never the other way round.
-->
{#each data.bloques as bloque (bloque.titulo)}
	<section class="mb-6">
		<h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-sand-500">{bloque.titulo}</h2>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each bloque.kpis as kpi (kpi.clave)}
				<StatCard
					label={kpi.label}
					value={kpi.valor}
					hint={kpi.hint ?? undefined}
					href={kpi.href ?? undefined}
					icon={kpi.icon}
					tone={kpi.tone ?? "neutral"}
				/>
			{/each}
		</div>
	</section>
{/each}
