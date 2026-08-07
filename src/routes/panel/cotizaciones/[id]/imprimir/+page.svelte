<script lang="ts">
	import DocumentoImprimible from "$lib/components/DocumentoImprimible.svelte";

	let { data } = $props();
	const c = $derived(data.cotizacion);
</script>

<svelte:head><title>Cotización #{c.folio} — Estación 360</title></svelte:head>

<DocumentoImprimible
	titulo="Cotización"
	folio={c.folio}
	fecha={c.createdAt}
	estadoLabel={c.estadoLabel}
	cliente={data.cliente}
	unidad={data.unidad}
	notaFolio={data.notaFolio}
	conceptos={c.conceptos}
	subtotal={c.subtotal}
	iva={c.iva}
	total={c.total}
	notas={c.notas}
	leyenda={c.vigenciaHasta
		? `Precios vigentes hasta el ${c.vigenciaHasta.slice(0, 10)}. Este documento no es un comprobante fiscal.`
		: "Este documento no es un comprobante fiscal."}
/>
