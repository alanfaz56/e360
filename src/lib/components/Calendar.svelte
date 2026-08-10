<!--
	The agenda, in four readings of the same data — one `vista` prop, not four components.

	`dia` and `semana` draw the hour grid and differ only in column count. `mes` is the planning
	overview: calendar-aligned weeks, because you read a month against "the 15th is a Tuesday".
	`agenda` is the flat chronological list — the one that stays usable on a phone, and the only
	one where a request with no hour sits in line with the appointments it competes with.

	Server-rendered, zero client JS: the layout (which appointment sits in which overlap column)
	is computed by `acomodar` in src/lib/agenda.ts before the data ever reaches the browser, and
	navigation between weeks is plain <a> links. Works with JavaScript off, Rule 7.

	Appointments still waiting for an hour sit in a "Sin hora" strip above the grid instead of
	being guessed onto it — that strip IS the cue that somebody has to confirm them.
-->
<script lang="ts">
	import Truck from "@lucide/svelte/icons/truck";
	import Bell from "@lucide/svelte/icons/bell";
	import { HORA_ABRE, HORA_CIERRA, ZONA, horaCorta, hoy, posicion, type Vista } from "$lib/agenda";

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
	/** A manual follow-up due this day. Never has an hour, so it never touches the time grid. */
	type Recordatorio = {
		id: string;
		unidadId: string;
		unidadEtiqueta: string;
		clienteNombre: string;
		motivo: string;
		tipoLabel: string;
	};
	type Bloque = { cita: Cita; inicio: Date; fin: Date; col: number; cols: number };
	type Dia = { fecha: string; sinHora: Cita[]; bloques: Bloque[]; recordatorios?: Recordatorio[] };

	let {
		dias,
		vista = "semana",
		/** The anchor date. Only the month view needs it: it greys out the padding days. */
		fecha = "",
	}: { dias: Dia[]; vista?: Vista; fecha?: string } = $props();

	const horas = Array.from({ length: HORA_CIERRA - HORA_ABRE }, (_, i) => HORA_ABRE + i);
	const hoyStr = hoy();

	const diaCorto = (f: string) =>
		new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, weekday: "short" }).format(new Date(`${f}T12:00:00-07:00`));
	const numeroDia = (f: string) => Number(f.slice(8, 10));
	const diaLargo = (f: string) =>
		new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" }).format(
			new Date(`${f}T12:00:00-07:00`),
		);

	/** Everything on a day, hour or not, in the order it happens. Drives `mes` and `agenda`. */
	const todasDelDia = (d: Dia) => [...d.bloques.map((b) => b.cita), ...d.sinHora];

	const mesAncla = $derived(fecha.slice(0, 7));
	// Only days with something on them. An agenda listing 30 empty rows is a wall of nothing.
	const conAlgo = $derived(
		dias.filter((d) => d.bloques.length > 0 || d.sinHora.length > 0 || (d.recordatorios?.length ?? 0) > 0),
	);

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

{#if vista === "mes"}
	<!--
		The planning overview. Calendar-aligned weeks and a fixed six rows, so the grid never jumps
		height between months and the 15th is always under the same weekday it really falls on.
	-->
	<div class="overflow-x-auto rounded-lg border border-sand-200 bg-white">
		<div class="min-w-152">
			<div class="grid grid-cols-7 border-b border-sand-200">
				{#each dias.slice(0, 7) as d (d.fecha)}
					<div
						class="border-r border-sand-200 py-1.5 text-center text-xs uppercase text-sand-500 last:border-r-0"
					>
						{diaCorto(d.fecha)}
					</div>
				{/each}
			</div>
			<div class="grid grid-cols-7">
				{#each dias as dia (dia.fecha)}
					{@const delMes = dia.fecha.slice(0, 7) === mesAncla}
					{@const todas = todasDelDia(dia)}
					<div
						class="min-h-24 border-b border-r border-sand-200 p-1 last:border-r-0
							{delMes ? '' : 'bg-sand-50/60'} {dia.fecha === hoyStr ? 'bg-brand-50' : ''}"
					>
						<a
							href="?vista=dia&fecha={dia.fecha}"
							class="mb-1 block text-right text-xs hover:underline
								{dia.fecha === hoyStr ? 'font-bold text-brand-700' : delMes ? 'text-sand-700' : 'text-sand-400'}"
						>
							{numeroDia(dia.fecha)}
						</a>
						<!-- Three, then a count: a cell that grows with the day's load stops being a grid. -->
						{#each todas.slice(0, 3) as cita (cita.id)}
							<a
								href="/panel/citas/{cita.id}"
								class="mb-0.5 block truncate rounded border px-1 py-0.5 text-[10px] leading-tight {estilo(
									cita.estado,
								)}"
								title="#{cita.folio} · {cita.nombre} · {cita.motivo}"
							>
								{#if cita.tipo === "recoleccion"}
									<Truck
										size={9}
										class="inline"
										aria-label="Recolección"
									/>
								{/if}
								{cita.nombre}
							</a>
						{/each}
						{#if todas.length > 3}
							<a
								href="?vista=dia&fecha={dia.fecha}"
								class="block text-[10px] text-sand-500 hover:underline"
							>
								+{todas.length - 3} más
							</a>
						{/if}
						{#if dia.recordatorios?.length}
							<a
								href="?vista=dia&fecha={dia.fecha}"
								class="mt-0.5 flex items-center gap-0.5 text-[10px] text-amber-700 hover:underline"
							>
								<Bell
									size={9}
									aria-hidden="true"
								/>
								{dia.recordatorios.length}
							</a>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>
{:else if vista === "agenda"}
	<!--
		The flat list. No grid to scroll sideways, so this is the one that works one-handed next to
		a truck — and requests with no hour appear in line instead of exiled to a strip.
	-->
	<div class="rounded-lg border border-sand-200 bg-white">
		{#if conAlgo.length === 0}
			<p class="p-6 text-center text-sm text-sand-500">Nada agendado en este periodo.</p>
		{:else}
			{#each conAlgo as dia (dia.fecha)}
				<section class="border-b border-sand-200 last:border-b-0">
					<h3
						class="sticky top-0 flex items-baseline gap-2 border-b border-sand-100 bg-sand-50 px-3 py-1.5 text-xs font-medium text-sand-700"
					>
						<a
							href="?vista=dia&fecha={dia.fecha}"
							class="hover:underline">{diaLargo(dia.fecha)}</a
						>
						{#if dia.fecha === hoyStr}<span class="text-brand-700">hoy</span>{/if}
					</h3>
					<ul>
						{#each dia.bloques as b (b.cita.id)}
							<li class="border-b border-sand-100 last:border-b-0">
								<a
									href="/panel/citas/{b.cita.id}"
									class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-sm hover:bg-sand-50"
								>
									<span class="w-20 shrink-0 font-medium text-sand-900">{horaCorta(b.inicio)}</span>
									<span
										class="inline-block size-2.5 shrink-0 rounded-sm border {estilo(b.cita.estado)}"
										aria-hidden="true"
									></span>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-sand-950">
											{#if b.cita.tipo === "recoleccion"}
												<Truck
													size={12}
													class="inline"
													aria-label="Recolección"
												/>
											{/if}
											{b.cita.nombre}
											<span class="text-sand-500">#{b.cita.folio}</span>
										</span>
										<span class="block truncate text-xs text-sand-600">
											{[b.cita.marca, b.cita.modelo].filter(Boolean).join(" ")}
											{b.cita.motivo ? `· ${b.cita.motivo}` : ""}
										</span>
									</span>
								</a>
							</li>
						{/each}
						{#each dia.sinHora as cita (cita.id)}
							<li class="border-b border-sand-100 last:border-b-0">
								<a
									href="/panel/citas/{cita.id}"
									class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-sm hover:bg-sand-50"
								>
									<span class="w-20 shrink-0 text-xs font-medium text-accent-700">Sin hora</span>
									<span
										class="inline-block size-2.5 shrink-0 rounded-sm border {estilo(cita.estado)}"
										aria-hidden="true"
									></span>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-sand-950">
											{#if cita.tipo === "recoleccion"}
												<Truck
													size={12}
													class="inline"
													aria-label="Recolección"
												/>
											{/if}
											{cita.nombre}
											<span class="text-sand-500">#{cita.folio}</span>
										</span>
										<span class="block truncate text-xs text-sand-600">{cita.motivo}</span>
									</span>
								</a>
							</li>
						{/each}
					</ul>
					{#if dia.recordatorios?.length}
						<ul class="border-t border-sand-100 bg-amber-50/40">
							{#each dia.recordatorios as r (r.id)}
								<li class="border-b border-sand-100 last:border-b-0">
									<a
										href="/panel/recordatorios?unidadId={r.unidadId}"
										class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-sm hover:bg-amber-100/60"
									>
										<span class="w-20 shrink-0 text-xs font-medium text-amber-700">Recordar</span>
										<Bell
											size={12}
											class="inline shrink-0"
											aria-hidden="true"
										/>
										<span class="min-w-0 flex-1">
											<span class="block truncate text-sand-950">
												{r.unidadEtiqueta}
												<span class="text-sand-500">· {r.tipoLabel}</span>
											</span>
											<span class="block truncate text-xs text-sand-600">{r.clienteNombre} · {r.motivo}</span>
										</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		{/if}
	</div>
{:else}
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
						<span class="font-display text-lg {dia.fecha === hoyStr ? 'text-brand-600' : 'text-sand-950'}">
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
									class="block rounded border px-1.5 py-1 text-[11px] leading-tight {estilo(
										cita.estado,
									)}"
								>
									<span class="font-medium">#{cita.folio} {cita.nombre}</span>
									{#if cita.tipo === "recoleccion"}
										<Truck
											size={11}
											class="inline"
											aria-label="Recolección"
										/>
									{/if}
								</a>
							{/each}
						</div>
					{/each}
				</div>
			{/if}

			<!-- Manual follow-ups due this day. Never has an hour, so it never competes for a grid slot. -->
			{#if dias.some((d) => d.recordatorios?.length)}
				<div
					class="grid border-b border-sand-200 bg-amber-50/60"
					style="grid-template-columns: 3.5rem repeat({dias.length}, minmax(0, 1fr))"
				>
					<div class="border-r border-sand-200 px-1 py-2 text-right text-[10px] leading-tight text-amber-700">
						Recordar
					</div>
					{#each dias as dia (dia.fecha)}
						<div class="space-y-1 border-r border-sand-200 p-1 last:border-r-0">
							{#each dia.recordatorios ?? [] as r (r.id)}
								<a
									href="/panel/recordatorios?unidadId={r.unidadId}"
									class="block rounded border border-amber-300 bg-amber-100 px-1.5 py-1 text-[11px] leading-tight text-amber-900"
									title="{r.clienteNombre} · {r.motivo}"
								>
									<Bell
										size={10}
										class="inline"
										aria-hidden="true"
									/>
									{r.unidadEtiqueta}
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
					<div
						class="relative border-r border-sand-200 last:border-r-0 {dia.fecha === hoyStr
							? 'bg-brand-50/30'
							: ''}"
					>
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
										<Truck
											size={11}
											class="inline"
											aria-label="Recolección"
										/>
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
{/if}

<!-- Legend. Cheap, and the dashed block otherwise needs explaining every time. -->
<ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sand-600">
	{#each ["solicitada", "confirmada", "en_proceso", "completada"] as estado (estado)}
		<li class="flex items-center gap-1.5">
			<span class="inline-block size-3 rounded-sm border {estilo(estado)}"></span>
			{estado === "solicitada" ? "Solicitada (sin confirmar)" : estado.replace("_", " ")}
		</li>
	{/each}
	<li class="flex items-center gap-1.5">
		<Truck
			size={13}
			aria-hidden="true"
		/>
		Recolección
	</li>
</ul>
