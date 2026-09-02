<script lang="ts">
	import CalendarDays from "@lucide/svelte/icons/calendar-days";
	import Activity from "@lucide/svelte/icons/activity";
	import Button from "$lib/components/Button.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import StatCard from "$lib/components/StatCard.svelte";
	import BarList from "$lib/components/BarList.svelte";
	import TrendBars from "$lib/components/TrendBars.svelte";
	import { haceCuanto } from "$lib/notificaciones";

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
<div class="max-w-5xl mx-auto">
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

	<!-- Gráficas: la misma pregunta que las KPIs de arriba, pero con la forma que le toca — cuánto
     y desde cuándo, no solo cuánto. Cada barra ya es un número (mark spec: nunca hay que
     pasar el cursor para leerla), y las de cartera y notas además navegan a su lista filtrada. -->
	{#if data.cartera || data.ingresos}
		<div class="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
			{#if data.cartera}
				<section class="rounded-lg border border-sand-200 bg-white p-4">
					<h2 class="mb-3 text-xs font-medium uppercase tracking-wide text-sand-500">
						Antigüedad de cartera
					</h2>
					<BarList bars={data.cartera} />
				</section>
			{/if}
			{#if data.ingresos}
				<section class="rounded-lg border border-sand-200 bg-white p-4">
					<h2 class="mb-3 text-xs font-medium uppercase tracking-wide text-sand-500">
						Ingresos, últimos 14 días
					</h2>
					<TrendBars puntos={data.ingresos} />
				</section>
			{/if}
		</div>
	{/if}

	{#if data.notas}
		<section class="mb-6 rounded-lg border border-sand-200 bg-white p-4">
			<h2 class="mb-3 text-xs font-medium uppercase tracking-wide text-sand-500">Notas por estado</h2>
			<BarList bars={data.notas} />
		</section>
	{/if}

	{#if data.movimientos.length > 0}
		<!-- Admin/Gerente only (movimientos:read) — a live read of citas/notas/pagos, not the audit
	     trail. `data.movimientos` is `[]` for anybody else, so this section is simply absent. -->
		<section class="mb-6">
			<h2 class="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-sand-500">
				<Activity
					size={14}
					aria-hidden="true"
				/>
				Últimos movimientos
			</h2>
			<div class="rounded-lg border border-sand-200 bg-white">
				<ul>
					{#each data.movimientos as m (m.id)}
						<li class="border-b border-sand-100 last:border-b-0">
							<a
								href={m.href}
								class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2.5 text-sm hover:bg-sand-50"
							>
								<span class="min-w-0">
									<span class="block truncate text-sand-950">{m.texto}</span>
									<span class="block text-xs text-sand-500">{m.detalle}</span>
								</span>
								<span class="shrink-0 whitespace-nowrap text-xs text-sand-500"
									>{haceCuanto(m.fecha)}</span
								>
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{/if}
</div>
