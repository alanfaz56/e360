<!--
	Scrolling table shell. Owns the overflow container, the borders and the header row so
	every table in the app scrolls the same way and no page body ever scrolls sideways.

	`columns` are header labels; pass `""` for an actions column with no visible heading.
	`row` renders the <td>s for one item.
-->
<script lang="ts" generics="T">
	import type { Snippet } from "svelte";

	let {
		columns,
		items,
		row,
	}: { columns: string[]; items: T[]; row: Snippet<[T]> } = $props();
</script>

<div class="overflow-x-auto rounded-lg border border-sand-200 bg-white">
	<table class="w-full min-w-lg text-left text-sm">
		<thead class="border-b border-sand-200 text-xs uppercase tracking-wide text-sand-500">
			<tr>
				{#each columns as column, i (i)}
					<th scope="col" class="px-4 py-2.5 font-medium">
						{#if column}{column}{:else}<span class="sr-only">Acciones</span>{/if}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each items as item (item)}
				<tr class="border-b border-sand-100 last:border-0">
					{@render row(item)}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
