<!--
	Customer is mandatory; vehicle is optional because this form is specifically for quotes made
	before an appointment. Both searches post stable ids, and the server re-validates ownership.
-->
<script lang="ts">
	import EntitySearch, { type Opcion } from "./EntitySearch.svelte";
	import { ErrorVisible, mensajeDeRespuesta } from "$lib/toasts.svelte";

	type Cliente = { id: string; nombreCompleto: string; tipoLabel: string };
	type Unidad = {
		id: string;
		clienteId: string;
		etiqueta: string;
		clienteNombre?: string | null;
		numeroEconomico?: string | null;
		placas?: string | null;
		vin?: string | null;
	};

	let {
		clientes = [],
		unidades = [],
		clienteId = "",
		clienteNombre = "",
		unidadId = "",
		unidadEtiqueta = "",
	}: {
		clientes?: Cliente[];
		unidades?: Unidad[];
		clienteId?: string;
		clienteNombre?: string;
		unidadId?: string;
		unidadEtiqueta?: string;
	} = $props();

	let clienteElegido = $state<string | null>(null);
	let unidadElegida = $state<string | null>(null);
	let unidadKey = $state(0);
	const clienteActual = $derived(clienteElegido ?? clienteId);
	const unidadActual = $derived(unidadElegida ?? unidadId);

	const exigirOk = async (res: Response, mensaje: string) => {
		if (!res.ok) throw new ErrorVisible(await mensajeDeRespuesta(res, mensaje));
		return res.json();
	};

	const buscarClientes = async (q: string, signal: AbortSignal): Promise<Opcion[]> => {
		const body = await exigirOk(
			await fetch(`/api/clientes?q=${encodeURIComponent(q)}&perPage=8`, { signal }),
			"No pudimos buscar clientes.",
		);
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
		if (!clienteActual) return [];
		const body = await exigirOk(
			await fetch(`/api/unidades?q=${encodeURIComponent(q)}&clienteId=${clienteActual}&perPage=8`, { signal }),
			"No pudimos buscar unidades.",
		);
		return (body.unidades ?? []).map(
			(u: {
				id: string;
				marca: string;
				modelo: string;
				anio: number | null;
				placas: string | null;
				vin: string | null;
				numeroEconomico: string | null;
			}) => ({
				id: u.id,
				label: `${u.marca} ${u.modelo}${u.anio ? ` ${u.anio}` : ""}`,
				detalles: [
					u.numeroEconomico ? `Econ. ${u.numeroEconomico}` : null,
					u.placas,
					u.vin ? `VIN ${u.vin}` : null,
				],
			}),
		);
	};

	const clientesFallback = $derived(clientes.map((c) => ({ id: c.id, label: c.nombreCompleto, hint: c.tipoLabel })));
	const unidadesFallback = $derived(
		unidades
			.filter((u) => !clienteActual || u.clienteId === clienteActual)
			.map((u) => ({
				id: u.id,
				label: u.etiqueta,
				hint: u.clienteNombre,
				detalles: [u.numeroEconomico, u.placas, u.vin],
			})),
	);
</script>

<div class="space-y-3 rounded border border-sand-200 p-3">
	<EntitySearch
		label="Cliente"
		name="clienteId"
		placeholder="Buscar por nombre, teléfono o RFC"
		value={clienteActual}
		valueLabel={clienteNombre}
		opciones={clientesFallback}
		buscar={buscarClientes}
		required
		onselect={(id) => {
			clienteElegido = id;
			unidadElegida = "";
			unidadKey += 1;
		}}
	/>

	{#key unidadKey}
		<EntitySearch
			label="Unidad (opcional)"
			name="unidadId"
			hint="Útil para medidas de llanta o promociones específicas. La cotización puede quedar solo al cliente."
			placeholder={clienteActual ? "Buscar en las unidades del cliente" : "Primero selecciona al cliente"}
			value={unidadActual}
			valueLabel={unidadEtiqueta}
			opciones={unidadesFallback}
			buscar={buscarUnidades}
			minimo={0}
		/>
	{/key}
</div>
