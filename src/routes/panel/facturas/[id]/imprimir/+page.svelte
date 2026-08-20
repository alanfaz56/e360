<script lang="ts">
	import DocumentoImprimible from "$lib/components/DocumentoImprimible.svelte";
	import { condicionPagoLabel } from "$lib/comercial";

	let { data } = $props();
	const f = $derived(data.factura);

	// The legend says what this piece of paper IS, which is the one thing somebody holding it has to
	// know: a stamped invoice's real document is the CFDI, and this is a copy of it for the folder.
	const leyenda = $derived(
		f.timbrada
			? f.entorno === "produccion"
				? "Representación impresa de un CFDI timbrado. El comprobante fiscal es el XML."
				: "TIMBRADA EN SANDBOX — sin validez fiscal. Sólo para pruebas."
			: "Documento interno. Esta factura todavía no está timbrada ante el SAT.",
	);
</script>

<svelte:head><title>Factura #{f.folio} — Estación 360</title></svelte:head>

<DocumentoImprimible
	titulo="Factura"
	folio={f.folio}
	fecha={f.emitidaAt ?? f.createdAt}
	estadoLabel={f.estadoLabel}
	cliente={data.cliente}
	unidad={data.unidad}
	notaFolio={f.notaFolio}
	conceptos={f.conceptos}
	subtotal={f.subtotal}
	iva={f.iva}
	total={f.total}
	notas={f.notas}
	uuid={f.uuid}
	condicion={condicionPagoLabel(f.condicionPago)}
	vence={f.vence}
	{leyenda}
	estado={f.estado}
/>
