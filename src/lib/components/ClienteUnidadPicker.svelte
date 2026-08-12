<!--
	Pick — or create on the spot — the customer, the vehicle and the person who hands it over.

	Used by both appointment drawers: "Nueva cita" at the counter and "Vincular" on a request off
	the public form. Extracted because those two must never drift on who a vehicle may belong to;
	the server half is `resolverClienteYUnidad` in src/lib/server/citas.ts and reads exactly the
	field names emitted here.

	Searching is the default and creating is one radio away, on purpose: the expensive mistake at
	a counter is registering a second copy of a customer or truck the shop already has.

	Progressive enhancement throughout — with JavaScript off BOTH halves render as plain selects
	and the server decides from `crearCliente` / `crearUnidad`, because radios cannot hide
	anything without JS. Nothing in the unused half may be `required`, or the browser blocks the
	submit on a field the user cannot see.
-->
<script lang="ts">
	import Sparkles from "@lucide/svelte/icons/sparkles";
	import EntitySearch, { type Opcion } from "./EntitySearch.svelte";
	import Field from "./Field.svelte";
	import { ErrorVisible, mensajeDeRespuesta } from "$lib/toasts.svelte";

	type ClienteOpcion = { id: string; nombreCompleto: string; tipoLabel: string };
	type UnidadOpcion = {
		id: string;
		etiqueta: string;
		numeroEconomico?: string | null;
		vin?: string | null;
		anio?: number | null;
		color?: string | null;
		clienteNombre?: string | null;
		archivado?: boolean;
	};
	type Sugerida = UnidadOpcion & {
		clienteId: string;
		marca: string;
		modelo: string;
		placas: string | null;
		motivo: string;
	};

	let {
		clientes = [],
		unidades = [],
		sugeridas = [],
		entregadores = [],
		clienteId = "",
		clienteNombre = "",
		unidadId = "",
		unidadEtiqueta = "",
		entregadorId = "",
		prefill = {},
		fichaClienteHref,
	}: {
		clientes?: ClienteOpcion[];
		unidades?: UnidadOpcion[];
		sugeridas?: Sugerida[];
		entregadores?: { id: string; nombre: string; telefono: string | null }[];
		clienteId?: string;
		clienteNombre?: string;
		unidadId?: string;
		unidadEtiqueta?: string;
		entregadorId?: string;
		/** What the customer already told us, used to prefill the create fields. */
		prefill?: {
			nombre?: string;
			telefono?: string;
			email?: string;
			marca?: string;
			modelo?: string;
			anio?: number | null;
			placas?: string;
			numeroEconomico?: string;
		};
		fichaClienteHref?: string;
	} = $props();

	let hydrated = $state(false);
	$effect(() => {
		hydrated = true;
	});

	let crearCliente = $state<boolean | null>(null);
	let crearUnidad = $state<boolean | null>(null);
	const creandoCliente = $derived(crearCliente ?? clientes.length === 0);
	// Default to picking when anything already matches — see the note above.
	const creandoUnidad = $derived(crearUnidad ?? (sugeridas.length === 0 && unidades.length === 0));

	const mostrarElegirCliente = $derived(!hydrated || !creandoCliente);
	const mostrarCrearCliente = $derived(!hydrated || creandoCliente);
	const mostrarElegirUnidad = $derived(!hydrated || !creandoUnidad);
	const mostrarCrearUnidad = $derived(!hydrated || creandoUnidad);

	let clienteElegido = $state<string | null>(null);
	let clienteElegidoNombre = $state<string | null>(null);
	const clienteActual = $derived(clienteElegido ?? clienteId);
	// So picking a unit fills the visible "Buscar cliente" box too, not just the id posted on
	// submit — otherwise the customer looked unchosen even though the server would have derived
	// it correctly from the unit anyway.
	const clienteActualNombre = $derived(
		clientes.find((c) => c.id === clienteActual)?.nombreCompleto ??
			(clienteElegido ? (clienteElegidoNombre ?? "") : clienteNombre),
	);

	// Remounting the unit search clears a selection that belonged to the previous customer — but
	// only when the CUSTOMER box is what changed. When picking a unit is what determined the
	// customer (`alElegirUnidad`), the unit just chosen already belongs to it; remounting there
	// would wipe the very selection that triggered the change.
	let unidadKey = $state(0);
	function cambiarCliente(id: string, nombre?: string | null, opts: { remontarUnidad?: boolean } = {}) {
		if (id === clienteActual) return;
		clienteElegido = id;
		clienteElegidoNombre = nombre ?? nombresPorCliente.get(id) ?? null;
		if (opts.remontarUnidad ?? true) unidadKey += 1;
	}

	// Which customer each searched vehicle belongs to, so picking one across the whole registry
	// also fills the customer instead of posting a mismatched pair the server rejects.
	const duenos = new Map<string, string>();
	const nombresPorCliente = new Map<string, string>();

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	// `res.ok` is checked before the body is read on purpose: without it a 403 or a 500 parses into
	// an object with no `clientes` key, the map yields `[]`, and the picker calmly reports "sin
	// resultados" — which reads as "this customer is not on file" and sends somebody off to
	// register a duplicate of a customer the shop already has.
	const exigirOk = async (res: Response, quePasaba: string) => {
		if (!res.ok) throw new ErrorVisible(await mensajeDeRespuesta(res, quePasaba));
		return res.json();
	};

	const buscarClientes = async (q: string, signal: AbortSignal): Promise<Opcion[]> => {
		const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&perPage=8`, { signal });
		const body = await exigirOk(res, "No pudimos buscar clientes.");
		return (body.clientes ?? []).map(
			(c: {
				id: string;
				nombreCompleto: string;
				tipoLabel: string;
				telefono: string | null;
				rfc: string | null;
			}) => ({
				id: c.id,
				label: c.nombreCompleto,
				hint: c.tipoLabel,
				detalles: [c.telefono, c.rfc],
			}),
		);
	};

	const buscarUnidades = async (q: string, signal: AbortSignal): Promise<Opcion[]> => {
		// Scoped to the chosen customer when there is one; otherwise the whole registry, so plates
		// alone find the vehicle and bring its owner with it.
		const scope = clienteActual ? `&clienteId=${clienteActual}` : "";
		const res = await fetch(`/api/unidades?q=${encodeURIComponent(q)}${scope}&perPage=8`, { signal });
		const body = await exigirOk(res, "No pudimos buscar unidades.");
		return (body.unidades ?? []).map(
			(u: {
				id: string;
				clienteId: string;
				clienteNombre: string | null;
				marca: string;
				modelo: string;
				anio: number | null;
				color: string | null;
				placas: string | null;
				vin: string | null;
				numeroEconomico: string | null;
			}) => {
				duenos.set(u.id, u.clienteId);
				if (u.clienteNombre) nombresPorCliente.set(u.clienteId, u.clienteNombre);
				return {
					id: u.id,
					label: `${u.marca} ${u.modelo}${u.anio ? ` ${u.anio}` : ""}`,
					hint: [u.clienteNombre, u.color].filter(Boolean).join(" · "),
					detalles: [
						u.numeroEconomico ? `Econ. ${u.numeroEconomico}` : null,
						u.placas,
						u.vin ? `VIN ${u.vin}` : null,
					],
				};
			},
		);
	};

	function alElegirUnidad(id: string) {
		const dueno = duenos.get(id);
		if (dueno) cambiarCliente(dueno, undefined, { remontarUnidad: false });
		cargarHistorial(id);
	}

	// Informational only — a service history panel that fails to load must never block picking
	// the unit and moving on. Best-effort fetch, no toast on failure.
	type NotaHistorial = {
		id: string;
		folio: number;
		recibidaAt: string;
		estadoLabel: string;
		motivo: string;
		garantiaDeFolio: number | null;
		garantias: { folio: number; estadoLabel: string }[];
	};
	let historial = $state<NotaHistorial[] | null>(null);
	let historialUnidadId = $state<string | null>(null);

	async function cargarHistorial(id: string) {
		historial = null;
		historialUnidadId = id || null;
		if (!id) return;
		try {
			const res = await fetch(`/api/unidades/${id}/historial`);
			if (!res.ok) return;
			const body = await res.json();
			if (historialUnidadId === id) historial = body.notas ?? [];
		} catch {
			// Best-effort — see above.
		}
	}

	$effect(() => {
		// Load once for whatever unit the drawer already opened with (editing an existing link).
		if (unidadId) cargarHistorial(unidadId);
	});

	// Empty-query fetches the customer's fleet, so `minimo={0}` for the unit box works. With no
	// customer chosen yet, an empty query would return the whole registry — noise, not help.
	const minimoUnidad = $derived(clienteActual ? 0 : 2);
</script>

<fieldset class="rounded border border-sand-200 p-3">
	<legend class="px-1 text-sm font-medium text-sand-700">Cliente</legend>

	{#if clientes.length > 0}
		<label class="flex items-center gap-2 text-sm text-sand-700">
			<input
				type="radio"
				name="crearCliente"
				value=""
				checked={!creandoCliente}
				onchange={() => (crearCliente = false)}
				class="size-4 accent-brand-600"
			/>
			Buscar un cliente registrado
		</label>
	{:else}
		<input
			type="hidden"
			name="crearCliente"
			value="1"
		/>
		<p class="text-sm text-sand-600">Todavía no hay clientes. Se creará uno con estos datos.</p>
	{/if}

	{#if mostrarElegirCliente && clientes.length > 0}
		<div class="mt-2">
			<EntitySearch
				label="Buscar cliente"
				name="clienteId"
				placeholder="Nombre, teléfono, RFC…"
				value={clienteActual}
				valueLabel={clienteActualNombre}
				opciones={clientes.map((c) => ({ id: c.id, label: c.nombreCompleto, hint: c.tipoLabel }))}
				buscar={buscarClientes}
				onselect={(id, op) => cambiarCliente(id, op?.label)}
			/>
			{#if fichaClienteHref}
				<p class="mt-1 text-xs text-sand-500">
					¿No aparece? <a
						class="underline"
						href={fichaClienteHref}>Búscalo en Clientes</a
					>.
				</p>
			{/if}
		</div>
	{/if}

	{#if clientes.length > 0}
		<label class="mt-3 flex items-center gap-2 text-sm text-sand-700">
			<input
				type="radio"
				name="crearCliente"
				value="1"
				checked={creandoCliente}
				onchange={() => (crearCliente = true)}
				class="size-4 accent-brand-600"
			/>
			Crear uno nuevo
		</label>
	{/if}

	{#if mostrarCrearCliente}
		<div class="mt-3 space-y-3">
			<Field
				label="Tipo"
				name="tipoCliente"
			>
				{#snippet children(id)}
					<select
						{id}
						name="tipoCliente"
						class={INPUT}
					>
						<option value="persona">Persona</option>
						<option value="organizacion">Organización</option>
					</select>
				{/snippet}
			</Field>
			<Field
				label="Nombre / Razón social"
				name="nombre"
				required={hydrated && creandoCliente}
				value={prefill.nombre ?? ""}
			/>
			<Field
				label="Apellidos"
				name="apellidos"
				hint="Solo si es persona."
			/>
			<Field
				label="Teléfono"
				name="telefono"
				type="tel"
				value={prefill.telefono ?? ""}
			/>
			<Field
				label="Correo"
				name="email"
				type="email"
				value={prefill.email ?? ""}
			/>
		</div>
	{/if}
</fieldset>

<fieldset class="rounded border border-sand-200 p-3">
	<legend class="px-1 text-sm font-medium text-sand-700">Unidad</legend>

	<!--
		Vehicles already on file that match what the customer said. A radio carries only the unit
		id — the server derives the owner from the vehicle — so this works with JavaScript off and
		picking a match also identifies the customer. Own field name: with no JS the search
		<select> is in the same form, and two inputs sharing a name means the last one wins.
	-->
	{#if sugeridas.length > 0}
		<div class="mb-3 rounded border border-brand-200 bg-brand-50 p-2">
			<p class="flex items-center gap-1.5 px-1 pb-1 text-xs font-bold text-brand-900">
				<Sparkles
					size={13}
					aria-hidden="true"
				/>
				Ya registradas que coinciden
			</p>
			<div class="space-y-1">
				{#each sugeridas as u (u.id)}
					<label
						class="flex cursor-pointer items-start gap-2 rounded border border-sand-200 bg-white p-2 hover:border-brand-600"
					>
						<input
							type="radio"
							name="sugeridaId"
							value={u.id}
							checked={unidadId === u.id}
							onchange={() => {
								crearUnidad = false;
								if (u.clienteId) cambiarCliente(u.clienteId);
								cargarHistorial(u.id);
							}}
							class="mt-1 size-4 shrink-0 accent-brand-600"
						/>
						<span class="min-w-0">
							<span class="block text-sm font-medium text-sand-950">
								{u.marca}
								{u.modelo}{u.anio ? ` ${u.anio}` : ""}
							</span>
							<span class="block text-xs text-sand-500">{u.clienteNombre} · {u.motivo}</span>
							<span class="mt-1 flex flex-wrap gap-1">
								{#each [u.numeroEconomico && `Econ. ${u.numeroEconomico}`, u.placas, u.vin && `VIN ${u.vin}`, u.color].filter(Boolean) as dato (dato)}
									<span class="rounded bg-sand-100 px-1.5 py-0.5 font-mono text-[11px] text-sand-700">
										{dato}
									</span>
								{/each}
							</span>
						</span>
					</label>
				{/each}
				<!-- Radios cannot be unpicked, so no-JS users need a way back out. -->
				<label class="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs text-sand-600">
					<input
						type="radio"
						name="sugeridaId"
						value=""
						checked={!sugeridas.some((u) => u.id === unidadId)}
						onchange={() => (crearUnidad = null)}
						class="size-4 shrink-0 accent-brand-600"
					/>
					Ninguna de estas — busco o registro otra
				</label>
			</div>
		</div>
	{/if}

	{#if unidades.length > 0 || sugeridas.length > 0}
		<label class="flex items-center gap-2 text-sm text-sand-700">
			<input
				type="radio"
				name="crearUnidad"
				value=""
				checked={!creandoUnidad}
				onchange={() => (crearUnidad = false)}
				class="size-4 accent-brand-600"
			/>
			Buscar una unidad registrada
		</label>
	{:else}
		<input
			type="hidden"
			name="crearUnidad"
			value="1"
		/>
		<p class="text-sm text-sand-600">Se registrará con estos datos, a nombre del cliente.</p>
	{/if}

	{#if mostrarElegirUnidad && (unidades.length > 0 || sugeridas.length > 0)}
		<div class="mt-2">
			{#key unidadKey}
				<EntitySearch
					label="Buscar unidad"
					name="unidadId"
					placeholder="Número económico, placas, VIN, marca…"
					minimo={minimoUnidad}
					value={unidadId}
					valueLabel={unidadEtiqueta}
					opciones={unidades
						.filter((u) => !u.archivado)
						.map((u) => ({
							id: u.id,
							label: u.etiqueta,
							hint: [u.clienteNombre, u.anio, u.color].filter(Boolean).join(" · ") || null,
							detalles: [
								u.numeroEconomico ? `Econ. ${u.numeroEconomico}` : null,
								u.vin ? `VIN ${u.vin}` : null,
							],
						}))}
					buscar={buscarUnidades}
					onselect={alElegirUnidad}
				/>
			{/key}
			<p class="mt-1 text-xs text-sand-500">
				{#if clienteActual}
					Busca por número económico, placas, VIN o marca dentro de sus unidades.
				{:else}
					Sin cliente elegido busca en todo el registro: al elegir la unidad se toma su dueño.
				{/if}
			</p>
		</div>
	{/if}

	<!--
		Informational, read-only: what has already happened to this vehicle. Fetched client-side
		because the picker resolves a unit before any nota exists yet — there is nothing server-side
		to render it from ahead of time. Failing quietly (see `cargarHistorial`) rather than a toast:
		this is context, not something the counter is blocked on.
	-->
	{#if historial && historial.length > 0}
		<div class="mt-3 rounded border border-sand-200 bg-sand-50 p-2">
			<p class="px-1 pb-1 text-xs font-bold text-sand-700">Historial de servicio de esta unidad</p>
			<ul class="max-h-40 space-y-1 overflow-y-auto text-xs text-sand-600">
				{#each historial.slice(0, 5) as n (n.id)}
					<li class="rounded bg-white px-2 py-1">
						<span class="font-medium text-sand-900">#{n.folio}</span>
						· {n.recibidaAt.slice(0, 10)} · {n.estadoLabel}
						{#if n.motivo}<span class="block text-sand-500">{n.motivo}</span>{/if}
						{#if n.garantiaDeFolio}
							<span class="mt-0.5 block text-accent-700">Garantía de la nota #{n.garantiaDeFolio}</span>
						{/if}
						{#if n.garantias.length > 0}
							<span class="mt-0.5 block text-accent-700">
								Con seguimiento de garantía: {n.garantias.map((g) => `#${g.folio} (${g.estadoLabel})`).join(", ")}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if unidades.length > 0 || sugeridas.length > 0}
		<label class="mt-3 flex items-center gap-2 text-sm text-sand-700">
			<input
				type="radio"
				name="crearUnidad"
				value="1"
				checked={creandoUnidad}
				onchange={() => (crearUnidad = true)}
				class="size-4 accent-brand-600"
			/>
			Registrar una nueva
		</label>
	{/if}

	{#if mostrarCrearUnidad}
		<div class="mt-3 space-y-3">
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<Field
					label="Marca"
					name="marca"
					required={hydrated && creandoUnidad}
					value={prefill.marca ?? ""}
				/>
				<Field
					label="Modelo"
					name="modelo"
					required={hydrated && creandoUnidad}
					value={prefill.modelo ?? ""}
				/>
				<Field
					label="Placas"
					name="placas"
					value={prefill.placas ?? ""}
				/>
				<Field
					label="Año"
					name="anio"
					type="number"
					value={prefill.anio ? String(prefill.anio) : ""}
				/>
				<Field
					label="Número económico"
					name="numeroEconomico"
					value={prefill.numeroEconomico ?? ""}
				/>
			</div>
			<Field
				label="VIN"
				name="vin"
				hint="Opcional, pero único cuando se captura."
			/>
		</div>
	{/if}
</fieldset>

{#if entregadores.length > 0}
	<Field
		label="¿Quién entrega la unidad?"
		name="entregadorId"
		hint="Solo contactos con rol de Entregador."
	>
		{#snippet children(id)}
			<select
				{id}
				name="entregadorId"
				class={INPUT}
			>
				<option value="">El cliente mismo</option>
				{#each entregadores as e (e.id)}
					<option
						value={e.id}
						selected={entregadorId === e.id}
					>
						{e.nombre}{e.telefono ? ` · ${e.telefono}` : ""}
					</option>
				{/each}
			</select>
		{/snippet}
	</Field>
{:else if clienteActual && fichaClienteHref}
	<p class="text-xs text-sand-500">
		Este cliente no tiene contactos con rol de Entregador.
		<a
			class="underline"
			href="{fichaClienteHref}/{clienteActual}">Agrégalos en su ficha</a
		> si alguien más va a entregar la unidad.
	</p>
{/if}
