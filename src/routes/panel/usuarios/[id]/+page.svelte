<script lang="ts">
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import Mail from "@lucide/svelte/icons/mail";
	import Lock from "@lucide/svelte/icons/lock";
	import Truck from "@lucide/svelte/icons/truck";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import StatCard from "$lib/components/StatCard.svelte";
	import { citaEstadoTone } from "$lib/citas";
	import { fechaLarga, horaCorta } from "$lib/agenda";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data } = $props();

	const u = $derived(data.usuario);
	const s = $derived(data.stats);
	const iniciales = $derived(
		u.name
			.split(" ")
			.slice(0, 2)
			.map((p) => p[0] ?? "")
			.join("")
			.toUpperCase(),
	);
	const dia = (fecha: string) => fechaLarga(fecha).replace(/^\w+, /, "");
</script>

<svelte:head><title>{u.name} — Estación 360</title></svelte:head>

<a
	href="/panel/usuarios"
	class="mb-4 inline-flex items-center gap-1.5 text-sm text-sand-600 hover:text-brand-700"
>
	<ArrowLeft
		size={16}
		aria-hidden="true"
	/>
	Usuarios
</a>

<div class="mb-6 flex flex-wrap items-center gap-4">
	<span
		class="font-display flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-600 text-2xl text-white"
		aria-hidden="true"
	>
		{iniciales}
	</span>
	<div class="min-w-0">
		<h1 class="font-display text-3xl text-sand-950">{u.name}</h1>
		<p class="mt-1 flex flex-wrap items-center gap-2 text-sm text-sand-600">
			<Mail
				size={14}
				aria-hidden="true"
			/>
			<a
				class="hover:text-brand-700"
				href="mailto:{u.email}">{u.email}</a
			>
			<Badge tone="brand">{u.roleLabel}</Badge>
			{#if !u.active}<Badge tone="danger">Bloqueado</Badge>{/if}
		</p>
	</div>
</div>

{#if !u.active && u.banReason}
	<p class="mb-5 flex items-start gap-2 rounded border border-sand-300 bg-sand-100 px-3 py-2 text-sm text-sand-700">
		<Lock
			size={15}
			class="mt-0.5 shrink-0"
			aria-hidden="true"
		/>
		<span><strong>Motivo del bloqueo:</strong> {u.banReason}</span>
	</p>
{/if}

<!-- Period picker. URL state, plain links: shareable and works with JavaScript off. -->
<div class="mb-4 flex flex-wrap items-center gap-2">
	<span class="text-sm text-sand-600">Periodo:</span>
	{#each data.periodos as p (p.value)}
		<Button
			href={searchHref(page.url, { periodo: p.value, desde: null, hasta: null })}
			variant={data.periodo === p.value ? "primary" : "ghost"}
			size="sm"
		>
			{p.label}
		</Button>
	{/each}
	<span class="text-xs text-sand-500">{dia(s.desde)} – {dia(s.hasta)}</span>
</div>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
	<StatCard
		label="Citas asignadas"
		value={s.total}
		icon="calendar-days"
		href="/panel/citas?asignadoId={u.id}&desde={s.desde}&hasta={s.hasta}"
	/>
	<StatCard
		label="Recolecciones"
		value={s.recolecciones}
		icon="car"
		tone="brand"
		href="/panel/citas?asignadoId={u.id}&tipo=recoleccion&desde={s.desde}&hasta={s.hasta}"
	/>
	<StatCard
		label="Completadas"
		value={s.completadas}
		tone="brand"
	/>
	<StatCard
		label="Cumplimiento"
		value={s.cumplimiento === null ? "—" : `${s.cumplimiento}%`}
		hint={s.cumplimiento === null
			? "Todavía no hay citas cerradas en el periodo"
			: "Completadas sobre las que ya se cerraron"}
		tone={s.cumplimiento !== null && s.cumplimiento < 70 ? "warn" : "neutral"}
	/>
</div>

<div class="mt-3 grid gap-3 sm:grid-cols-3">
	<StatCard
		label="Confirmadas"
		value={s.confirmadas}
	/>
	<StatCard
		label="En proceso"
		value={s.enProceso}
	/>
	<StatCard
		label="No asistió"
		value={s.noAsistio}
		tone={s.noAsistio > 0 ? "warn" : "neutral"}
	/>
</div>

<h2 class="font-display mt-8 mb-3 text-xl text-sand-950">Próximas citas</h2>
{#if s.proximas.length === 0}
	<EmptyState
		title="Sin citas próximas"
		description="No tiene nada asignado de hoy en adelante."
	/>
{:else}
	<DataTable
		columns={["Folio", "Cuándo", "Cliente", "Estado", ""]}
		items={s.proximas}
	>
		{#snippet row(cita)}
			<td class="px-4 py-2.5 font-medium text-sand-950">#{cita.folio}</td>
			<td class="px-4 py-2.5">
				<span class="block text-sand-950">{dia(cita.fecha)}</span>
				<span class="block text-xs text-sand-500">
					{cita.inicio ? horaCorta(new Date(cita.inicio)) : "Sin hora"}
				</span>
			</td>
			<td class="px-4 py-2.5 text-sand-950">{cita.clienteNombre ?? cita.nombre}</td>
			<td class="px-4 py-2.5">
				<span class="flex flex-wrap items-center gap-1.5">
					<Badge tone={citaEstadoTone(cita.estado)}>{cita.estadoLabel}</Badge>
					{#if cita.tipo === "recoleccion"}
						<Badge tone="brand"
							><Truck
								size={11}
								class="inline"
								aria-hidden="true"
							/> Recolección</Badge
						>
					{/if}
				</span>
			</td>
			<td class="px-4 py-2.5 text-right">
				<Button
					href="/panel/citas/{cita.id}"
					variant="ghost"
					size="sm">Ver</Button
				>
			</td>
		{/snippet}
	</DataTable>
{/if}
