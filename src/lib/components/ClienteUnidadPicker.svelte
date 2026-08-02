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
		prefill?: { nombre?: string; telefono?: string; email?: string; marca?: string; modelo?: string; anio?: number | null; placas?: string };
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
	const clienteActual = $derived(clienteElegido ?? clienteId);

	// Remounting the unit search clears a selection that belonged to the previous customer.
	let unidadKey = $state(0);
	function cambiarCliente(id: string) {
		if (id === clienteActual) return;
		clienteElegido = id;
		unidadKey += 1;
	}

	// Which customer each searched vehicle belongs to, so picking one across the whole registry
	// also fills the customer instead of posting a mismatched pair the server rejects.
	const duenos = new Map<string, string>();

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const buscarClientes = async (q: string, signal: AbortSignal): Promise<Opcion[]> => {
		const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&perPage=8`, { signal });
		const body = await res.json();
		return (body.clientes ?? []).map((c: { id: string; nombreCompleto: string; tipoLabel: string; telefono: string | null; rfc: string | null }) => ({
			id: c.id,
			label: c.nombreCompleto,
			hint: c.tipoLabel,
			detalles: [c.telefono, c.rfc],
		}));
	};

	const buscarUnidades = async (q: string, signal: AbortSignal): Promise<Opcion[]> => {
		// Scoped to the chosen customer when there is one; otherwise the whole registry, so plates
		// alone find the vehicle and bring its owner with it.
		const scope = clienteActual ? `&clienteId=${clienteActual}` : "";
		const res = await fetch(`/api/unidades?q=${encodeURIComponent(q)}${scope}&perPage=8`, { signal });
		const body = await res.json();
		return (body.unidades ?? []).map((u: { id: string; clienteId: string; clienteNombre: string | null; marca: string; modelo: string; anio: number | null; color: string | null; placas: string | null; vin: string | null; numeroEconomico: string | null }) => {
			duenos.set(u.id, u.clienteId);
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
		});
	};

	function alElegirUnidad(id: string) {
		const dueno = duenos.get(id);
		if (dueno) cambiarCliente(dueno);
	}
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
		<input type="hidden" name="crearCliente" value="1" />
		<p class="text-sm text-sand-600">Todavía no hay clientes. Se creará uno con estos datos.</p>
	{/if}

	{#if mostrarElegirCliente && clientes.length > 0}
		<div class="mt-2">
			<EntitySearch
				label="Buscar cliente"
				name="clienteId"
				placeholder="Nombre, teléfono, RFC…"
				value={clienteId}
				valueLabel={clienteNombre}
				opciones={clientes.map((c) => ({ id: c.id, label: c.nombreCompleto, hint: c.tipoLabel }))}
				buscar={buscarClientes}
				onselect={cambiarCliente}
			/>
			{#if fichaClienteHref}
				<p class="mt-1 text-xs text-sand-500">
					¿No aparece? <a class="underline" href={fichaClienteHref}>Búscalo en Clientes</a>.
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
			<Field label="Tipo" name="tipoCliente">
				{#snippet children(id)}
					<select {id} name="tipoCliente" class={INPUT}>
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
			<Field label="Apellidos" name="apellidos" hint="Solo si es persona." />
			<Field label="Teléfono" name="telefono" type="tel" value={prefill.telefono ?? ""} />
			<Field label="Correo" name="email" type="email" value={prefill.email ?? ""} />
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
				<Sparkles size={13} aria-hidden="true" />
				Ya registradas que coinciden
			</p>
			<div class="space-y-1">
				{#each sugeridas as u (u.id)}
					<label class="flex cursor-pointer items-start gap-2 rounded border border-sand-200 bg-white p-2 hover:border-brand-600">
						<input
							type="radio"
							name="sugeridaId"
							value={u.id}
							checked={unidadId === u.id}
							onchange={() => {
								crearUnidad = false;
								if (u.clienteId) cambiarCliente(u.clienteId);
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
		<input type="hidden" name="crearUnidad" value="1" />
		<p class="text-sm text-sand-600">Se registrará con estos datos, a nombre del cliente.</p>
	{/if}

	{#if mostrarElegirUnidad && (unidades.length > 0 || sugeridas.length > 0)}
		<div class="mt-2">
			{#key unidadKey}
				<EntitySearch
					label="Buscar unidad"
					name="unidadId"
					placeholder="Número económico, placas, VIN, marca…"
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
			<div class="grid grid-cols-2 gap-3">
				<Field label="Marca" name="marca" required={hydrated && creandoUnidad} value={prefill.marca ?? ""} />
				<Field label="Modelo" name="modelo" required={hydrated && creandoUnidad} value={prefill.modelo ?? ""} />
				<Field label="Placas" name="placas" value={prefill.placas ?? ""} />
				<Field label="Año" name="anio" type="number" value={prefill.anio ? String(prefill.anio) : ""} />
			</div>
			<Field label="VIN" name="vin" hint="Opcional, pero único cuando se captura." />
		</div>
	{/if}
</fieldset>

{#if entregadores.length > 0}
	<Field label="¿Quién entrega la unidad?" name="entregadorId" hint="Solo contactos con rol de Entregador.">
		{#snippet children(id)}
			<select {id} name="entregadorId" class={INPUT}>
				<option value="">El cliente mismo</option>
				{#each entregadores as e (e.id)}
					<option value={e.id} selected={entregadorId === e.id}>
						{e.nombre}{e.telefono ? ` · ${e.telefono}` : ""}
					</option>
				{/each}
			</select>
		{/snippet}
	</Field>
{:else if clienteActual && fichaClienteHref}
	<p class="text-xs text-sand-500">
		Este cliente no tiene contactos con rol de Entregador.
		<a class="underline" href="{fichaClienteHref}/{clienteActual}">Agrégalos en su ficha</a> si alguien
		más va a entregar la unidad.
	</p>
{/if}
