<!--
	"Your payment is due soon" warning, shown on every panel screen once the shop enters the
	5-day warning window before its Estación 360 subscription is due — never blocking, just a nag.

	`bloqueado` never renders this: that state already IS the whole screen via the redirect in
	`panel/+layout.server.ts` — a modal on top of a page that's already only the upload form would
	be redundant. Reads `estadoPago`/`vencimientoLabel` already computed by the layout's load — no
	second query, no duplicated cycle-status logic.
-->
<script lang="ts">
	let { estadoPago, vencimientoLabel }: { estadoPago: "al_corriente" | "por_vencer" | "bloqueado"; vencimientoLabel: string } =
		$props();

	// Closed only for this page view (not persisted) — reappears on the next navigation, which is
	// the point: a recurring nag, not a one-time notice a click makes go away for good.
	let cerrado = $state(false);
</script>

{#if estadoPago === "por_vencer" && !cerrado}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-sand-950/40 p-4">
		<div class="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
			<p class="font-medium text-sand-950">Tu pago mensual vence el {vencimientoLabel}</p>
			<p class="mt-1 text-sm text-sand-600">
				Si no se sube un comprobante antes de esa fecha, el sistema se bloqueará hasta que se registre el pago.
			</p>
			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (cerrado = true)}
					class="rounded-md px-3 py-1.5 text-sm text-sand-600 hover:bg-sand-100"
				>
					Cerrar
				</button>
				<a
					href="/panel/facturacion-app"
					class="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
				>
					Subir comprobante
				</a>
			</div>
		</div>
	</div>
{/if}
