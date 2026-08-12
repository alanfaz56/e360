<script lang="ts">
	import ShieldCheck from "@lucide/svelte/icons/shield-check";
	import Button from "$lib/components/Button.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { ROLE_LABEL } from "$lib/roles";

	let { data, form } = $props();

	// Grouped by the part before ":" — "cotizacion:create" and "cotizacion:send" belong together,
	// and scrolling ~80 individually-labeled rows with no structure is how a real change gets
	// buried in the noise of the ones nobody touched.
	const grupos = $derived.by(() => {
		const mapa = new Map<string, typeof data.filas>();
		for (const f of data.filas) {
			const [recurso] = f.permiso.split(":");
			mapa.set(recurso, [...(mapa.get(recurso) ?? []), f]);
		}
		return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
	});
</script>

<svelte:head>
	<title>Permisos — Estación 360</title>
</svelte:head>

<PageHeader
	title="Permisos"
	description="Qué puede hacer cada rol. Cualquier permiso nuevo que se agregue al código aparece aquí solo — no hay que construir nada para editarlo."
/>

<Flash {form} />

<form method="POST" action="?/guardar" class="mt-4">
	<div class="overflow-x-auto rounded-lg border border-sand-200 bg-white">
		<table class="w-full text-sm">
			<thead class="sticky top-0 bg-sand-50 text-xs uppercase tracking-wide text-sand-500">
				<tr>
					<th class="px-4 py-2.5 text-left">Permiso</th>
					{#each data.roles as rol (rol)}
						<th class="px-4 py-2.5 text-center">{ROLE_LABEL[rol]}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each grupos as [recurso, filas] (recurso)}
					<tr class="bg-sand-50">
						<td colspan={data.roles.length + 1} class="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-sand-600">
							{recurso}
						</td>
					</tr>
					{#each filas as f (f.permiso)}
						<tr class="border-t border-sand-100">
							<td class="px-4 py-2 font-mono text-xs text-sand-700">{f.permiso}</td>
							{#each data.roles as rol (rol)}
								{@const bloqueado = f.permiso === "permisos:manage" && rol === "admin"}
								<td class="px-4 py-2 text-center">
									<input
										type="checkbox"
										name="perm__{f.permiso}__{rol}"
										value="1"
										checked={f.roles.includes(rol)}
										disabled={bloqueado}
										title={bloqueado ? "Admin no puede perder este permiso — bloquearía la propia pantalla." : undefined}
										class="size-4 accent-brand-600 disabled:opacity-60"
									/>
									{#if bloqueado}
										<input type="hidden" name="perm__{f.permiso}__{rol}" value="1" />
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				{/each}
			</tbody>
		</table>
	</div>

	<div class="sticky bottom-0 mt-4 flex justify-end border-t border-sand-200 bg-sand-100/95 py-3 backdrop-blur">
		<Button full={false}>
			<ShieldCheck size={18} aria-hidden="true" />
			Guardar cambios
		</Button>
	</div>
</form>
