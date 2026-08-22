<script lang="ts">
	import KeyRound from "@lucide/svelte/icons/key-round";
	import ShieldAlert from "@lucide/svelte/icons/shield-alert";
	import Receipt from "@lucide/svelte/icons/receipt";
	import FlaskConical from "@lucide/svelte/icons/flask-conical";
	import Save from "@lucide/svelte/icons/save";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import Field from "$lib/components/Field.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import StatCard from "$lib/components/StatCard.svelte";
	import { entornoLabel } from "$lib/facturacion";
	import { page } from "$app/state";

	let { data, form } = $props();

	const INPUT =
		"mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

	const entorno = $derived(data.ajustes.find((a) => a.clave === "facturacion.entorno")?.valor ?? "sandbox");
	const enProduccion = $derived(entorno === "produccion");
	const deGrupo = (grupo: string) => data.ajustes.filter((a) => a.grupo === grupo);

	const fecha = (iso: string | null) =>
		iso ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—";
</script>

<svelte:head><title>Ajustes del sistema — Estación 360</title></svelte:head>

<PageHeader
	title="Ajustes del sistema"
	description="Llaves, proveedores y consumo. Sólo lo ve la cuenta que administra el software."
/>

<Flash {form} />

<!--
	The environment is the single most consequential setting on this screen, so it is stated before
	anything else rather than being one row among four: in production every stamp is a real CFDI
	that costs a timbre and needs a SAT cancellation to undo.
-->
<div
	class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-4 {enProduccion
		? 'border-danger/40 bg-danger/10'
		: 'border-sand-200 bg-sand-50'}"
>
	{#if enProduccion}
		<ShieldAlert
			size={22}
			aria-hidden="true"
			class="shrink-0 text-danger"
		/>
	{:else}
		<FlaskConical
			size={22}
			aria-hidden="true"
			class="shrink-0 text-sand-500"
		/>
	{/if}
	<div class="min-w-0">
		<p class="font-medium text-sand-950">Entorno: {entornoLabel(entorno)}</p>
		<p class="text-sm text-sand-700">
			{#if enProduccion}
				Cada timbrado emite un CFDI real ante el SAT, gasta un timbre y sólo se deshace cancelando.
			{:else}
				Nada de lo que se timbre aquí tiene validez fiscal. Es donde se prueba.
			{/if}
		</p>
	</div>
</div>

{#if !data.puedeGuardarSecretos}
	<p
		role="alert"
		class="mb-4 flex items-start gap-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-sand-900"
	>
		<ShieldAlert
			size={16}
			aria-hidden="true"
			class="mt-0.5 shrink-0 text-danger"
		/>
		<span>
			Falta <code class="font-mono">AJUSTES_SECRET_KEY</code> en el servidor. Sin ella no se pueden guardar
			credenciales: se guardan cifradas y la llave para descifrarlas no vive en la base de datos. Genérala con
			<code class="font-mono">npm run llave</code>.
		</span>
	</p>
{/if}

<!-- Uso ---------------------------------------------------------------------------------------->
<section class="mb-6">
	<h2 class="mb-2 font-display text-lg text-sand-950">Consumo de timbrado · últimos {data.dias} días</h2>
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<StatCard
			label="Timbres de producción"
			value={String(data.uso.produccion)}
			hint="Los que sí se cobran"
		/>
		<StatCard
			label="Timbrados en sandbox"
			value={String(data.uso.sandbox)}
			hint="No cuestan nada"
		/>
		<StatCard
			label="Facturas sin timbrar"
			value={String(data.uso.sinTimbrar)}
			hint="Emitidas que todavía no tienen folio fiscal"
			href="/panel/cotizaciones"
		/>
		<StatCard
			label="Proveedor"
			value={data.proveedores.find((p) => p.clave === data.proveedorActivo)?.label ?? "—"}
			hint="Se cambia sin redeploy"
		/>
	</div>

	{#if data.uso.ultimas.length > 0}
		<div class="mt-3">
			<DataTable
				columns={["Folio", "UUID", "Entorno", "Total", "Timbrada"]}
				items={data.uso.ultimas}
			>
				{#snippet row(f)}
					<td class="px-4 py-2.5 font-medium text-sand-950">#{f.folio}</td>
					<td class="px-4 py-2.5 font-mono text-xs text-sand-600">{f.uuid}</td>
					<td class="px-4 py-2.5">
						<Badge tone={f.entorno === "produccion" ? "brand" : "neutral"}>
							{entornoLabel(f.entorno ?? "sandbox")}
						</Badge>
					</td>
					<td class="px-4 py-2.5 text-sand-800">${f.total}</td>
					<td class="px-4 py-2.5 text-sand-600">{fecha(f.timbradaAt)}</td>
				{/snippet}
			</DataTable>
		</div>
	{/if}
</section>

<!-- Ajustes ------------------------------------------------------------------------------------>
<!--
	A real form that posts and redirects, like every other write in the panel — no drawer, because
	this screen IS the settings, not an action taken on top of something else.
-->
<form
	method="POST"
	action="?/guardar"
	class="space-y-6"
>
	{#each data.grupos as grupo (grupo.clave)}
		<section class="rounded-lg border border-sand-200 bg-white p-4">
			<h2 class="flex items-center gap-2 font-display text-lg text-sand-950">
				<Receipt
					size={18}
					aria-hidden="true"
					class="text-sand-500"
				/>
				{grupo.label}
			</h2>
			<p class="mt-0.5 text-sm text-sand-600">{grupo.descripcion}</p>

			<div class="mt-4 grid gap-4 sm:grid-cols-2">
				{#each deGrupo(grupo.clave) as ajuste (ajuste.clave)}
					<div>
						{#if ajuste.tipo === "opcion"}
							<Field
								label={ajuste.label}
								name={ajuste.clave}
								hint={ajuste.descripcion}
							>
								{#snippet children(id)}
									<select
										{id}
										name={ajuste.clave}
										class={INPUT}
									>
										{#each ajuste.opciones as op (op.valor)}
											<option
												value={op.valor}
												selected={ajuste.valor === op.valor}>{op.label}</option
											>
										{/each}
									</select>
								{/snippet}
							</Field>
						{:else if ajuste.tipo === "secreto"}
							<!--
								A stored secret is never rendered — not masked in the value, absent from it.
								The field is empty and posting it empty means "leave it alone", which is
								what an untouched form does. Erasing one is the explicit checkbox below.
							-->
							<Field
								label={ajuste.label}
								name={ajuste.clave}
								type="password"
								autocomplete="off"
								placeholder={ajuste.configurado ? ajuste.pista : "Sin configurar"}
								hint={ajuste.configurado
									? `Guardada (${ajuste.pista}). Déjalo vacío para no cambiarla.`
									: (ajuste.ayuda ?? ajuste.descripcion)}
							/>
							{#if ajuste.configurado}
								<label class="mt-1.5 flex items-center gap-2 text-xs text-sand-600">
									<input
										type="checkbox"
										name="{ajuste.clave}__borrar"
										value="1"
										class="size-4 accent-danger"
									/>
									Borrarla
								</label>
							{/if}
						{:else}
							<Field
								label={ajuste.label}
								name={ajuste.clave}
								value={ajuste.valor}
								hint={ajuste.valor ? ajuste.descripcion : (ajuste.ayuda ?? ajuste.descripcion)}
							/>
						{/if}

						{#if ajuste.actualizadoAt}
							<p class="mt-1 text-xs text-sand-400">
								Última vez: {fecha(ajuste.actualizadoAt)}{ajuste.actualizadoPor
									? ` · ${ajuste.actualizadoPor}`
									: ""}
							</p>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/each}

	<!-- Bottom of the form, where a thumb reaches. -->
	<Button>
		<Save
			size={18}
			aria-hidden="true"
		/>
		Guardar ajustes
	</Button>
</form>

<!-- Webhook de Telegram -------------------------------------------------------------------------
	A separate form and section, not inside the ajustes grid above — nesting it there would put a
	<form> inside the "Guardar ajustes" <form>, which browsers silently reflow and break. This is
	also a different KIND of write: not a stored credential, a live call to Telegram's own API. -->
<section class="mt-6 rounded-lg border border-sand-200 bg-white p-4">
	<h2 class="font-display text-lg text-sand-950">Webhook de Telegram</h2>
	<p class="mt-0.5 text-sm text-sand-600">
		Lo que Telegram tiene registrado ahora mismo — no lo que un despliegue anterior haya dejado.
	</p>

	<div class="mt-3 rounded-md border border-sand-200 bg-sand-50 p-3">
		{#if data.telegramWebhook === null}
			<p class="text-sm text-sand-600">Configura y guarda el bot token de arriba para poder registrarlo.</p>
		{:else if "error" in data.telegramWebhook}
			<p class="text-sm text-danger">No se pudo consultar con Telegram: {data.telegramWebhook.error}</p>
		{:else}
			<p class="text-sm text-sand-700">
				Registrado en Telegram: <code class="font-mono text-xs">{data.telegramWebhook.url || "(nada registrado)"}</code>
			</p>
			{#if data.telegramWebhook.pendingUpdateCount > 0}
				<p class="mt-1 text-xs text-sand-500">
					{data.telegramWebhook.pendingUpdateCount} actualización(es) sin entregar — Telegram no puede llegar a esa
					URL.
				</p>
			{/if}
			{#if data.telegramWebhook.lastErrorMessage}
				<p class="mt-1 text-sm text-danger">
					Último error de Telegram{data.telegramWebhook.lastErrorDate
						? ` (${fecha(new Date(data.telegramWebhook.lastErrorDate * 1000).toISOString())})`
						: ""}: {data.telegramWebhook.lastErrorMessage}
				</p>
			{/if}
		{/if}

		<p class="mt-2 text-xs text-sand-500">
			Este botón lo registra en: <code class="font-mono">{page.url.origin}/api/telegram/webhook</code>
		</p>
		<form
			method="POST"
			action="?/registrarWebhookTelegram"
			class="mt-2"
		>
			<Button
				type="submit"
				variant="outline"
				size="sm"
			>
				Registrar webhook con esta URL
			</Button>
		</form>
	</div>
</section>

<p class="mt-6 flex items-start gap-2 text-xs text-sand-500">
	<KeyRound
		size={14}
		aria-hidden="true"
		class="mt-0.5 shrink-0"
	/>
	<span>
		Las llaves se guardan cifradas con AES-256-GCM. La llave que las descifra vive en el servidor, no en la base de
		datos, así que un respaldo de la base no es un juego de credenciales. La auditoría registra qué ajuste cambió y
		quién, nunca su valor.
	</span>
</p>
