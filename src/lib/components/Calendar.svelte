<!--
	The agenda grid. Week and day are the same component with a different column count — one
	`vista` prop, not two components.

	Server-rendered, zero client JS: the layout (which appointment sits in which overlap column)
	is computed by `acomodar` in src/lib/agenda.ts before the data ever reaches the browser, and
	navigation between weeks is plain <a> links. Works with JavaScript off, Rule 7.

	Appointments still waiting for an hour sit in a "Sin hora" strip above the grid instead of
	being guessed onto it — that strip IS the cue that somebody has to confirm them.
-->
<script lang="ts">
	import Truck from "@lucide/svelte/icons/truck";
	import { HORA_ABRE, HORA_CIERRA, ZONA, horaCorta, hoy, posicion } from "$lib/agenda";

	// Structural, not imported from $lib/server — this component runs in the browser and must
	// never pull a server module in behind a type import.
	type Cita = {
		id: string;
		folio: number;
		estado: string;
		tipo: string;
		nombre: string;
		motivo: string;
		marca: string | null;
		modelo: string | null;
	};
	type Bloque = { cita: Cita; inicio: Date; fin: Date; col: number; cols: number };
	type Dia = { fecha: string; sinHora: Cita[]; bloques: Bloque[] };

	let { dias, vista = "semana" }: { dias: Dia[]; vista?: "semana" | "dia" } = $props();

	const horas = Array.from({ length: HORA_CIERRA - HORA_ABRE }, (_, i) => HORA_ABRE + i);
	const hoyStr = hoy();

	const diaCorto = (fecha: string) =>
		new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, weekday: "short" }).format(
			new Date(`${fecha}T12:00:00-07:00`),
		);
	const numeroDia = (fecha: string) => Number(fecha.slice(8, 10));

	// Estado drives the block's colour so the calendar reads at a glance. `solicitada` is drawn
	// dashed and pale — it does not have a real hour yet, it only has one because staff will pick.
	const ESTILO: Record<string, string> = {
		solicitada: "border-dashed border-accent-500 bg-accent-500/15 text-sand-800",
		confirmada: "border-brand-600 bg-brand-50 text-brand-900",
		en_proceso: "border-brand-700 bg-brand-600 text-white",
		completada: "border-ok bg-ok/20 text-sand-800",
		no_asistio: "border-sand-300 bg-sand-100 text-sand-500",
		cancelada: "border-sand-300 bg-sand-100 text-sand-500 line-through",
	};
	const estilo = (estado: string) => ESTILO[estado] ?? ESTILO.confirmada;
</script>

<div class="overflow-x-auto rounded-lg border border-sand-200 bg-white">
	<div class={vista === "dia" ? "" : "min-w-208"}>
		<!-- Day headers -->
		<div
			class="grid border-b border-sand-200"
			style="grid-template-columns: 3.5rem repeat({dias.length}, minmax(0, 1fr))"
		>
			<div class="border-r border-sand-200"></div>
			{#each dias as dia (dia.fecha)}
				<a
					href="?vista=dia&fecha={dia.fecha}"
					class="border-r border-sand-200 px-2 py-2 text-center last:border-r-0 hover:bg-sand-50
						{dia.fecha === hoyStr ? 'bg-brand-50' : ''}"
				>
					<span class="block text-xs uppercase text-sand-500">{diaCorto(dia.fecha)}</span>
					<span
						class="font-display text-lg {dia.fecha === hoyStr ? 'text-brand-600' : 'text-sand-950'}"
					>
						{numeroDia(dia.fecha)}
					</span>
				</a>
			{/each}
		</div>

		<!-- Requests with no hour yet -->
		{#if dias.some((d) => d.sinHora.length)}
			<div
				class="grid border-b border-sand-200 bg-sand-50"
				style="grid-template-columns: 3.5rem repeat({dias.length}, minmax(0, 1fr))"
			>
				<div class="border-r border-sand-200 px-1 py-2 text-right text-[10px] leading-tight text-sand-500">
					Sin hora
				</div>
				{#each dias as dia (dia.fecha)}
					<div class="space-y-1 border-r border-sand-200 p-1 last:border-r-0">
						{#each dia.sinHora as cita (cita.id)}
							<a
								href="/panel/citas/{cita.id}"
								class="block rounded border px-1.5 py-1 text-[11px] leading-tight {estilo(cita.estado)}"
							>
								<span class="font-medium">#{cita.folio} {cita.nombre}</span>
								{#if cita.tipo === "recoleccion"}
									<Truck size={11} class="inline" aria-label="Recolección" />
								{/if}
							</a>
						{/each}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Hour grid -->
		<div
			class="relative grid"
			style="grid-template-columns: 3.5rem repeat({dias.length}, minmax(0, 1fr))"
		>
			<!-- Hour labels -->
			<div class="border-r border-sand-200">
				{#each horas as h (h)}
					<div class="h-14 border-b border-sand-100 pr-1 text-right text-[10px] text-sand-500">
						{h}:00
					</div>
				{/each}
			</div>

			{#each dias as dia (dia.fecha)}
				<div class="relative border-r border-sand-200 last:border-r-0 {dia.fecha === hoyStr ? 'bg-brand-50/30' : ''}">
					{#each horas as h (h)}
						<div class="h-14 border-b border-sand-100"></div>
					{/each}

					{#each dia.bloques as b (b.cita.id)}
						{@const pos = posicion(b.inicio, b.fin)}
						<a
							href="/panel/citas/{b.cita.id}"
							title="{horaCorta(b.inicio)} · {b.cita.nombre} · {b.cita.motivo}"
							class="absolute overflow-hidden rounded border px-1.5 py-0.5 text-[11px] leading-tight {estilo(
								b.cita.estado,
							)}"
							style="top:{pos.top}%; height:{pos.alto}%; left:calc({(b.col / b.cols) *
								100}% + 2px); width:calc({100 / b.cols}% - 4px)"
						>
							<span class="block truncate font-medium">
								{horaCorta(b.inicio)} · {b.cita.nombre}
							</span>
							<span class="block truncate">
								{#if b.cita.tipo === "recoleccion"}
									<Truck size={11} class="inline" aria-label="Recolección" />
								{/if}
								{b.cita.marca ?? ""}
								{b.cita.modelo ?? ""}
							</span>
						</a>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</div>

<!-- Legend. Cheap, and the dashed block otherwise needs explaining every time. -->
<ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sand-600">
	{#each ["solicitada", "confirmada", "en_proceso", "completada"] as estado (estado)}
		<li class="flex items-center gap-1.5">
			<span class="inline-block size-3 rounded-sm border {estilo(estado)}"></span>
			{estado === "solicitada" ? "Solicitada (sin confirmar)" : estado.replace("_", " ")}
		</li>
	{/each}
	<li class="flex items-center gap-1.5">
		<Truck size={13} aria-hidden="true" />
		Recolección
	</li>
</ul>
