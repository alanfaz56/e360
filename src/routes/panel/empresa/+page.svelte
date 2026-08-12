<script lang="ts">
	import Button from "$lib/components/Button.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { telefonoFormato } from "$lib/empresa";

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Datos de la empresa — Estación 360</title>
</svelte:head>

<div class="mx-auto max-w-xl space-y-6">
	<PageHeader
		title="Datos de la empresa"
		description="Lo que se muestra en el sitio público y en los correos: teléfono, WhatsApp, sitio web."
	/>

	<Flash {form} />

	<form
		method="POST"
		action="?/guardar"
		class="space-y-4 rounded-lg border border-sand-200 bg-white p-5"
	>
		<Field
			label="Teléfono / WhatsApp"
			name="telefono"
			value={form?.valores?.telefono ?? data.empresa.telefono ?? ""}
			hint={data.empresa.telefono
				? `Se usa como tel: y wa.me en todo el sitio. Hoy: ${telefonoFormato(data.empresa.telefono)}`
				: "10 dígitos, sin lada de país. Se usa para el botón de llamar y el de WhatsApp en todo el sitio público."}
		/>
		<Field
			label="Sitio web"
			name="sitioWeb"
			value={form?.valores?.sitioWeb ?? data.empresa.sitioWeb ?? ""}
			hint="Como se muestra, por ejemplo estacion360.com"
		/>
		<Button full>Guardar</Button>
	</form>
</div>
