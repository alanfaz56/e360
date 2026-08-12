<script lang="ts">
	import Landmark from "@lucide/svelte/icons/landmark";
	import Plus from "@lucide/svelte/icons/plus";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Archive from "@lucide/svelte/icons/archive";
	import ArchiveRestore from "@lucide/svelte/icons/archive-restore";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const drawer = $derived(page.url.searchParams.get("drawer"));
	const editando = $derived(data.cuentas.find((c) => c.id === page.url.searchParams.get("cuenta")));
	const closeDrawer = $derived(searchHref(page.url, { drawer: null, cuenta: null }));
</script>

<svelte:head>
	<title>Cuentas bancarias — Estación 360</title>
</svelte:head>

<PageHeader
	title="Cuentas bancarias"
	description="A dónde transfieren los clientes. La cuenta principal es la que se muestra en las cotizaciones por correo."
>
	{#snippet actions()}
		<Button href={searchHref(page.url, { drawer: "nueva" })}>
			<Plus size={18} aria-hidden="true" />
			Nueva cuenta
		</Button>
	{/snippet}
</PageHeader>

<Flash {form} />

<form method="GET" class="mt-4">
	<label class="flex items-center gap-2 text-sm text-sand-600">
		<input
			type="checkbox"
			name="archivadas"
			value="1"
			checked={data.filtros.archivadas}
			onchange={(e) => (window.location.href = searchHref(page.url, { archivadas: e.currentTarget.checked ? "1" : null }))}
			class="size-4 accent-brand-600"
		/>
		Incluir archivadas
	</label>
</form>

{#if data.cuentas.length === 0}
	<div class="mt-6">
		<EmptyState title="Todavía no hay cuentas" description="Da de alta la cuenta a la que transfieren los clientes.">
			{#snippet icon()}<Landmark size={40} aria-hidden="true" />{/snippet}
		</EmptyState>
	</div>
{:else}
	<div class="mt-6">
		<DataTable columns={["Banco", "Titular", "CLABE / Cuenta", "", ""]} items={data.cuentas}>
			{#snippet row(c)}
				<td class="px-4 py-2.5">
					<span class="block font-medium text-sand-950">{c.banco}</span>
					{#if c.archivada}<Badge tone="neutral">Archivada</Badge>{/if}
				</td>
				<td class="px-4 py-2.5 text-sand-900">{c.titular}</td>
				<td class="px-4 py-2.5">
					<span class="block font-mono text-xs text-sand-700">{c.clabe ?? "—"}</span>
					{#if c.numeroCuenta}<span class="block font-mono text-xs text-sand-500">Cta. {c.numeroCuenta}</span>{/if}
				</td>
				<td class="px-4 py-2.5">
					{#if c.principal}<Badge tone="ok">Principal</Badge>{/if}
				</td>
				<td class="px-4 py-2.5 text-right">
					<span class="flex flex-wrap justify-end gap-1">
						<Button href={searchHref(page.url, { drawer: "editar", cuenta: c.id })} variant="ghost" size="sm">
							<Pencil size={14} aria-hidden="true" />
							Editar
						</Button>
						{#if c.archivada}
							<form method="POST" action="?/restaurar">
								<input type="hidden" name="id" value={c.id} />
								<Button variant="ghost" size="sm">
									<ArchiveRestore size={14} aria-hidden="true" />
									Restaurar
								</Button>
							</form>
						{:else}
							<form method="POST" action="?/archivar">
								<input type="hidden" name="id" value={c.id} />
								<Button variant="ghost" size="sm">
									<Archive size={14} aria-hidden="true" />
									Archivar
								</Button>
							</form>
						{/if}
					</span>
				</td>
			{/snippet}
		</DataTable>
	</div>
{/if}

{#if (drawer === "nueva" || drawer === "editar") && (drawer === "nueva" || editando)}
	{@const c = drawer === "editar" ? editando : null}
	<Drawer
		title={c ? "Editar cuenta" : "Nueva cuenta"}
		description="CLABE o número de cuenta — captura al menos uno."
		closeHref={closeDrawer}
	>
		<form method="POST" action={c ? "?/editar" : "?/crear"} class="space-y-4">
			{#if c}<input type="hidden" name="id" value={c.id} />{/if}
			<Field label="Banco" name="banco" value={form?.valores?.banco ?? c?.banco ?? ""} required />
			<Field label="Titular" name="titular" value={form?.valores?.titular ?? c?.titular ?? ""} required />
			<Field
				label="CLABE"
				name="clabe"
				value={form?.valores?.clabe ?? c?.clabe ?? ""}
				hint="18 dígitos."
			/>
			<Field
				label="Número de cuenta"
				name="numeroCuenta"
				value={form?.valores?.numeroCuenta ?? c?.numeroCuenta ?? ""}
			/>
			<Field label="Notas" name="notas" value={form?.valores?.notas ?? c?.notas ?? ""} hint="Opcional." />
			<label class="flex cursor-pointer items-center gap-2 py-1.5 text-sm text-sand-700">
				<input
					type="checkbox"
					name="principal"
					checked={c?.principal ?? false}
					class="size-4 accent-brand-600"
				/>
				Cuenta principal (la que se muestra en las cotizaciones)
			</label>
			<Button full>{c ? "Guardar cambios" : "Dar de alta"}</Button>
		</form>
	</Drawer>
{/if}
