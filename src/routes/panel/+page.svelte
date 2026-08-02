<script lang="ts">
	import CalendarPlus from "@lucide/svelte/icons/calendar-plus";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import List from "@lucide/svelte/icons/list";
	import UserCheck from "@lucide/svelte/icons/user-check";
	import Button from "$lib/components/Button.svelte";
	import Calendar from "$lib/components/Calendar.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import StatCard from "$lib/components/StatCard.svelte";
	import { CITA_TIPOS, CITA_TIPO_DEFAULT, CITA_TIPO_KEYS } from "$lib/citas";
	import { fechaLarga } from "$lib/agenda";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const drawer = $derived(page.url.searchParams.get("drawer"));
	const v = (name: string) => String(form?.valores?.[name] ?? "");

	// `||`, not `??`: v() returns "" when the field is absent, and "" is not nullish — with `??`
	// the default silently never applied and no option came preselected.
	let tipoElegido = $state<string | null>(null);
	const tipo = $derived(tipoElegido ?? (v("tipo") || CITA_TIPO_DEFAULT));

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const rango = $derived(
		data.vista === "dia"
			? fechaLarga(data.fecha)
			: `${fechaLarga(data.desde).replace(/^\w+, /, "")} – ${fechaLarga(data.hasta).replace(/^\w+, /, "")}`,
	);
	const irA = (fecha: string) => searchHref(page.url, { fecha, drawer: null });
</script>

<svelte:head><title>Agenda — Estación 360</title></svelte:head>

<PageHeader title="Agenda" description="Lo que entra al taller esta semana.">
	{#snippet actions()}
		<Button href="/panel/citas" variant="outline">
			<List size={18} aria-hidden="true" />
			Ver todas
		</Button>
		{#if data.puede.crear}
			<Button href={searchHref(page.url, { drawer: "nueva" })}>
				<CalendarPlus size={18} aria-hidden="true" />
				Nueva cita
			</Button>
		{/if}
	{/snippet}
</PageHeader>

{#if form?.creada}
	<p role="status" class="mb-4 rounded border border-ok bg-ok/15 px-3 py-2 text-sm text-sand-800">
		Cita agendada.
	</p>
{:else if form?.message}
	<p role="alert" class="mb-4 rounded border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-900">
		{form.message}
	</p>
{/if}

<div class="mb-6 grid gap-3 sm:grid-cols-3">
	<StatCard label="Citas hoy" value={data.resumen.citasHoy} icon="calendar-days" href={searchHref(page.url, { vista: "dia", fecha: data.hoy })} />
	<StatCard
		label="Solicitudes por confirmar"
		value={data.resumen.solicitudes}
		href="/panel/citas?estado=solicitada"
		tone={data.resumen.solicitudes > 0 ? "warn" : "neutral"}
		hint={data.resumen.solicitudes > 0 ? "Llegaron del formulario público" : "Nada pendiente"}
	/>
	<StatCard
		label="Recolecciones hoy"
		value={data.resumen.recoleccionesHoy}
		icon="car"
		tone="brand"
		href="/panel/citas?tipo=recoleccion&desde={data.hoy}&hasta={data.hoy}"
	/>
</div>

<!-- Calendar navigation. Plain links: the whole view is URL state, so it works with JS off. -->
<div class="mb-3 flex flex-wrap items-center gap-2">
	<Button href={irA(data.anterior)} variant="ghost" size="sm" aria-label="Anterior">
		<ChevronLeft size={16} aria-hidden="true" />
	</Button>
	<Button href={irA(data.hoy)} variant="ghost" size="sm">Hoy</Button>
	<Button href={irA(data.siguiente)} variant="ghost" size="sm" aria-label="Siguiente">
		<ChevronRight size={16} aria-hidden="true" />
	</Button>
	<span class="text-sm font-medium text-sand-700">{rango}</span>
	<div class="ml-auto flex flex-wrap gap-1">
		<!-- Filter state is a URL param, so a filtered agenda is shareable and survives reloads. -->
		<Button
			href={searchHref(page.url, { mias: data.mias ? null : "1", drawer: null })}
			variant={data.mias ? "primary" : "ghost"}
			size="sm"
		>
			<UserCheck size={16} aria-hidden="true" />
			Solo las mías
		</Button>
		{#each [["semana", "Semana"], ["dia", "Día"]] as [value, label] (value)}
			<Button
				href={searchHref(page.url, { vista: value, drawer: null })}
				variant={data.vista === value ? "primary" : "ghost"}
				size="sm"
			>
				{label}
			</Button>
		{/each}
	</div>
</div>

{#if data.mias}
	<p class="mb-3 flex flex-wrap items-center gap-2 rounded border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
		Mostrando solo las citas asignadas a ti.
		<a class="font-medium underline" href={searchHref(page.url, { mias: null })}>Ver todas</a>
	</p>
{/if}

<Calendar dias={data.dias} vista={data.vista} />

{#if drawer === "nueva" && data.puede.crear}
	<Drawer
		title="Nueva cita"
		description="Se agenda confirmada, con hora. Las solicitudes del formulario público llegan sin hora."
		closeHref={searchHref(page.url, { drawer: null })}
	>
		<form method="POST" action="?/crear" class="space-y-4">
			<Field label="Nombre del cliente" name="nombre" required value={v("nombre")} />
			<Field label="Teléfono" name="telefono" type="tel" required value={v("telefono")} />

			<div class="grid grid-cols-2 gap-3">
				<Field label="Marca" name="marca" value={v("marca")} />
				<Field label="Modelo" name="modelo" value={v("modelo")} />
				<Field label="Placas" name="placas" value={v("placas")} />
				<Field label="Año" name="anio" type="number" value={v("anio")} />
			</div>

			<Field label="¿Qué necesita?" name="motivo">
				{#snippet children(id)}
					<textarea {id} name="motivo" required rows="2" class={INPUT}>{v("motivo")}</textarea>
				{/snippet}
			</Field>

			<div class="grid grid-cols-2 gap-3">
				<Field label="Inicio" name="inicio" type="datetime-local" required value={v("inicio")} />
				<Field label="Fin" name="fin" type="datetime-local" value={v("fin")} hint="Opcional: 1 h." />
			</div>

			<Field label="Tipo" name="tipo">
				{#snippet children(id)}
					<select
						{id}
						name="tipo"
						required
						class={INPUT}
						onchange={(e) => (tipoElegido = e.currentTarget.value)}
					>
						{#each CITA_TIPO_KEYS as t (t)}
							<option value={t} selected={tipo === t}>{CITA_TIPOS[t].label}</option>
						{/each}
					</select>
				{/snippet}
			</Field>

			{#if tipo === "recoleccion"}
				<Field
					label="Dirección de recolección"
					name="direccionRecoleccion"
					required
					value={v("direccionRecoleccion")}
				/>
				{#if data.puede.asignar}
					<Field label="Asignar a" name="asignadoId">
						{#snippet children(id)}
							<select {id} name="asignadoId" class={INPUT}>
								<option value="">Sin asignar</option>
								{#each data.asignables as u (u.id)}
									<option value={u.id} selected={v("asignadoId") === u.id}>
										{u.name} · {u.roleLabel}
									</option>
								{/each}
							</select>
						{/snippet}
					</Field>
				{/if}
			{/if}

			<Field label="Notas internas" name="notas">
				{#snippet children(id)}
					<textarea {id} name="notas" rows="2" class={INPUT}>{v("notas")}</textarea>
				{/snippet}
			</Field>

			<Button full>Agendar</Button>
		</form>
	</Drawer>
{/if}
