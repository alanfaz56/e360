<script lang="ts">
	import PageHeader from "$lib/components/PageHeader.svelte";
	import Badge from "$lib/components/Badge.svelte";

	let { data } = $props();

	type Rol = "admin" | "gerente" | "operador" | "taller";
	const ROLE_LABEL: Record<Rol, string> = {
		admin: "Admin",
		gerente: "Gerente",
		operador: "Operador",
		taller: "Taller",
	};

	type Tema = {
		id: string;
		titulo: string;
		roles: Rol[];
		abierto?: boolean;
	};

	// El orden es el orden real del flujo del taller: de cómo llega el vehículo a cómo se cobra.
	const TEMAS: Tema[] = [
		{ id: "citas", titulo: "Citas: agendar y recibir", roles: ["admin", "gerente", "operador"] },
		{ id: "notas", titulo: "Nota de servicio: el ciclo completo del vehículo", roles: ["admin", "gerente", "operador", "taller"] },
		{ id: "cotizaciones", titulo: "Cotizaciones: cotizar y que el cliente responda", roles: ["admin", "gerente", "operador"] },
		{ id: "estimaciones", titulo: "Estimaciones internas: lo que dice el mecánico que cuesta", roles: ["admin", "gerente", "taller"] },
		{ id: "cobro", titulo: "Cobrar: nota de venta o factura", roles: ["admin", "gerente", "operador"] },
		{ id: "pagos", titulo: "Pagos y crédito", roles: ["admin", "gerente", "operador"] },
		{ id: "inventario", titulo: "Inventario y compras (CFDI de proveedores)", roles: ["admin", "gerente", "operador"] },
		{ id: "talleres", titulo: "Talleres aliados", roles: ["admin", "gerente", "operador"] },
		{ id: "clientes", titulo: "Clientes y unidades", roles: ["admin", "gerente", "operador"] },
		{ id: "notificaciones", titulo: "Avisos y notificaciones", roles: ["admin", "gerente", "operador", "taller"] },
		{ id: "permisos", titulo: "Roles y permisos", roles: ["admin"] },
	];

	// Resalta primero los temas que sí aplican al rol que está leyendo — nadie tiene que adivinar
	// cuál sección es la suya en una lista de once.
	const paraMi = (t: Tema) => t.roles.includes(data.role as Rol);
</script>

<svelte:head>
	<title>Manual de uso — Estación 360</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<PageHeader
		title="Manual de uso"
		description="Cómo funciona cada paso, en el orden en que realmente pasan en el taller. Los temas marcados para tu rol aparecen resaltados."
	/>

	<nav class="rounded-lg border border-sand-200 bg-white p-4">
		<p class="text-xs font-medium text-sand-500">Ir directo a:</p>
		<ul class="mt-2 flex flex-wrap gap-2">
			{#each TEMAS as t (t.id)}
				<li>
					<a
						href="#{t.id}"
						class="inline-block rounded-full border px-3 py-1 text-xs {paraMi(t)
							? 'border-brand-300 bg-brand-50 text-brand-700'
							: 'border-sand-200 text-sand-600'} hover:border-brand-400"
					>
						{t.titulo}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<!-- Citas ---------------------------------------------------------------------------------->
	<details
		id="citas"
		class="group rounded-lg border border-sand-200 bg-white p-5 open:pb-5"
		open
	>
		<summary class="flex cursor-pointer list-none items-center justify-between gap-3">
			<h2 class="font-display text-lg text-sand-950">1. Citas: agendar y recibir</h2>
			<span class="text-sand-400 group-open:rotate-180">▾</span>
		</summary>
		<div class="mt-3 space-y-3 text-sm text-sand-700">
			<p>
				Una cita puede llegar de dos formas: alguien la agenda desde el sitio público
				(<Badge tone="warn">solicitada</Badge>, sin vehículo ni cliente vinculado todavía), o
				se crea directo desde el panel ya lista para recibir.
			</p>
			<p>
				<strong>Vincular</strong> es lo primero que se hace con una solicitud pública: buscar o
				dar de alta al cliente, elegir o registrar su unidad. Sin eso, "Recibir unidad" no tiene
				con qué trabajar.
			</p>
			<p>
				<strong>Recibir unidad</strong> es el botón que convierte una cita confirmada en una nota
				de servicio — la unidad ya está físicamente en el taller. De ahí en adelante todo pasa
				en la nota, no en la cita.
			</p>
		</div>
	</details>

	<!-- Notas de servicio ------------------------------------------------------------------------>
	<details
		id="notas"
		class="group rounded-lg border border-sand-200 bg-white p-5 open:pb-5"
		open
	>
		<summary class="flex cursor-pointer list-none items-center justify-between gap-3">
			<h2 class="font-display text-lg text-sand-950">2. Nota de servicio: el ciclo completo</h2>
			<span class="text-sand-400 group-open:rotate-180">▾</span>
		</summary>
		<div class="mt-3 space-y-3 text-sm text-sand-700">
			<p>
				La nota de servicio es el expediente del vehículo mientras está contigo. Solo puede
				haber <strong>una nota abierta por unidad a la vez</strong> — si ya tiene una, hay que
				cerrarla (entregar o cancelar) antes de abrir otra.
			</p>
			<p>Sus estados, en el orden en que normalmente se recorren:</p>
			<ul class="ml-4 list-disc space-y-1">
				<li><Badge>Recibida</Badge> — acaba de entrar. Aquí se hace la inspección de entrada: kilometraje, combustible, condición general y fotos.</li>
				<li><Badge tone="brand">En diagnóstico</Badge> — se está revisando qué tiene.</li>
				<li>
					<Badge tone="brand">En taller externo</Badge> — se mandó a un taller aliado (hojalatería,
					transmisiones, lo que no se hace en casa). La unidad se transfiere y regresa por el
					mismo camino.
				</li>
				<li><Badge tone="ok">Lista</Badge> — el trabajo terminó, falta que el cliente la recoja.</li>
				<li>
					<Badge tone="ok">Entregada</Badge> — cerrada. Antes de llegar aquí hay que pasar el
					checklist de <strong>Liberación 360</strong>, quince puntos que alguien tiene que
					marcar (frenos, luces, niveles, etc.) — no se puede entregar sin completarlo.
				</li>
				<li><Badge tone="danger">Cancelada</Badge> — se canceló, con motivo.</li>
			</ul>
			<p>
				Todo lo demás cuelga de la nota: sus cotizaciones, sus facturas o notas de venta, las
				estimaciones internas, las refacciones que se surtieron del almacén, los comentarios
				(internos o visibles al cliente) y la liga de seguimiento que se le manda por WhatsApp
				para que vea el estatus sin necesidad de cuenta.
			</p>
		</div>
	</details>

	<!-- Cotizaciones --------------------------------------------------------------------------->
	<details
		id="cotizaciones"
		class="group rounded-lg border border-sand-200 bg-white p-5 open:pb-5"
	>
		<summary class="flex cursor-pointer list-none items-center justify-between gap-3">
			<h2 class="font-display text-lg text-sand-950">3. Cotizaciones: cotizar y que el cliente responda</h2>
			<span class="text-sand-400 group-open:rotate-180">▾</span>
		</summary>
		<div class="mt-3 space-y-3 text-sm text-sand-700">
			<p>Una cotización tiene DOS estados corriendo al mismo tiempo, y responden preguntas distintas:</p>
			<ul class="ml-4 list-disc space-y-1">
				<li>
					<strong>Lo que dice el cliente</strong> — <Badge>Borrador</Badge> →
					<Badge tone="warn">Enviada</Badge> → <Badge tone="ok">Autorizada</Badge> o
					<Badge tone="danger">Rechazada</Badge>. Solo se edita mientras es Borrador; en
					cuanto se envía, los números quedan congelados — si hay que corregir algo, se hace
					una cotización nueva.
				</li>
				<li>
					<strong>Lo que hace el taller</strong> — Pendiente → En proceso → Completada → Por
					cobrar → Cobrada. Esta pista no puede avanzar de Pendiente sin que el cliente ya haya
					autorizado, y "Por cobrar" pide que ya exista algo facturado o una nota de venta.
					"Cobrada" nadie la marca a mano: se pone sola cuando los pagos alcanzan el total.
				</li>
			</ul>
			<p>
				<strong>Vencida</strong> aparece sola cuando pasó la fecha de vigencia sin respuesta — es
				solo una etiqueta visual, no cambia lo que el cliente realmente contestó si responde tarde.
			</p>
			<p>
				Un renglón puede venir del catálogo de productos o ser algo escrito a mano para ese
				trabajo. También se puede armar una cotización importando el <strong>CFDI de una
				compra a proveedor</strong> — cada renglón queda ligado a esa compra, y quien tiene
				permiso de inventario puede ver de qué compra vino cada uno directamente en la
				cotización.
			</p>
		</div>
	</details>

	<!-- Estimaciones internas -------------------------------------------------------------------->
	<details
		id="estimaciones"
		class="group rounded-lg border border-sand-200 bg-white p-5 open:pb-5"
	>
		<summary class="flex cursor-pointer list-none items-center justify-between gap-3">
			<h2 class="font-display text-lg text-sand-950">4. Estimaciones internas: lo que dice el mecánico que cuesta</h2>
			<span class="text-sand-400 group-open:rotate-180">▾</span>
		</summary>
		<div class="mt-3 space-y-3 text-sm text-sand-700">
			<p>
				Casi siempre llega por WhatsApp: el mecánico dice cuánto le va a costar la mano de obra
				o algo que no está en el catálogo. Alguien de mostrador la captura como una estimación,
				<Badge tone="warn">Pendiente</Badge> hasta que Admin o Gerente la revisa y la
				<Badge tone="ok">Aprueba</Badge> o <Badge tone="danger">Rechaza</Badge> — decisión
				final, no se reabre: si cambió algo, se manda una estimación nueva.
			</p>
			<p>
				Una vez aprobada se puede <strong>ligar a una cotización</strong> del cliente. Ahí es
				donde entra el margen: el sistema resta el costo (esta estimación, más lo que
				realmente costaron las refacciones que se surtieron del almacén) del precio cotizado —
				eso es lo que ve Admin en "utilidad", nunca algo que el mecánico ve.
			</p>
		</div>
	</details>

	<!-- Cobro: nota de venta / factura --------------------------------------------------------->
	<details
		id="cobro"
		class="group rounded-lg border border-sand-200 bg-white p-5 open:pb-5"
		open
	>
		<summary class="flex cursor-pointer list-none items-center justify-between gap-3">
			<h2 class="font-display text-lg text-sand-950">5. Cobrar: nota de venta o factura</h2>
			<span class="text-sand-400 group-open:rotate-180">▾</span>
		</summary>
		<div class="mt-3 space-y-3 text-sm text-sand-700">
			<p>
				En cuanto el cliente autoriza una cotización, aparece un botón único:
				<strong>Cobrar</strong>. Ahí se elige uno de dos caminos — no hay que saber de
				antemano cuál usar, se decide en ese momento:
			</p>
			<ul class="ml-4 list-disc space-y-1">
				<li>
					<strong>Nota de venta</strong> — sin IVA. El cliente paga exactamente el subtotal de
					la cotización. Es lo normal cuando no piden factura. Se puede cobrar completa o en
					abonos.
				</li>
				<li>
					<strong>Factura</strong> — con IVA, es el CFDI. Se emite primero como cuenta por
					cobrar; <strong>timbrarla</strong> (el paso que de verdad la manda al SAT y le da
					folio fiscal) es una acción aparte, para cuando ya se quiere el documento fiscal real.
				</li>
			</ul>
			<p>
				<strong>Si el cliente cambia de opinión</strong> — pagó como nota de venta y luego sí
				pide factura — no hay que cobrar de nuevo. La nota de venta tiene un botón "Convertir
				en factura": calcula el IVA sobre lo ya cobrado y mueve los pagos que ya existían a la
				factura nueva. Solo queda pendiente el IVA que antes no se había cobrado.
			</p>
			<p>
				Una nota de venta o una factura sin ningún pago encima todavía se puede cancelar. En
				cuanto tiene un pago registrado, ya no — a partir de ahí es una nota de crédito, que es
				otro documento.
			</p>
		</div>
	</details>

	<!-- Pagos y crédito -------------------------------------------------------------------------->
	<details
		id="pagos"
		class="group rounded-lg border border-sand-200 bg-white p-5 open:pb-5"
	>
		<summary class="flex cursor-pointer list-none items-center justify-between gap-3">
			<h2 class="font-display text-lg text-sand-950">6. Pagos y crédito</h2>
			<span class="text-sand-400 group-open:rotate-180">▾</span>
		</summary>
		<div class="mt-3 space-y-3 text-sm text-sand-700">
			<p>
				Registrar un pago es exactamente eso: cuánto, cómo (efectivo, tarjeta, transferencia,
				cheque, otro) y cuándo. Se pueden registrar varios pagos parciales — el sistema nunca
				deja pasar un pago que exceda el saldo pendiente.
			</p>
			<p>
				<strong>De contado</strong> es lo normal. <strong>A crédito</strong> solo aplica si el
				cliente tiene un límite asignado (Admin/Gerente lo configuran en su ficha); si una venta
				se pasa de ese límite, el sistema lo avisa con el monto exacto en que se pasa, y solo se
				puede forzar dejando por escrito el motivo — queda registrado.
			</p>
		</div>
	</details>

	<!-- Inventario / CFDI ------------------------------------------------------------------------>
	<details
		id="inventario"
		class="group rounded-lg border border-sand-200 bg-white p-5 open:pb-5"
	>
		<summary class="flex cursor-pointer list-none items-center justify-between gap-3">
			<h2 class="font-display text-lg text-sand-950">7. Inventario y compras (CFDI de proveedores)</h2>
			<span class="text-sand-400 group-open:rotate-180">▾</span>
		</summary>
		<div class="mt-3 space-y-3 text-sm text-sand-700">
			<p>
				El inventario funciona por <strong>capas</strong>: cada compra abre una capa con su
				propio costo unitario, y lo que sale se descuenta de la capa más vieja primero. Así el
				costo real de una refacción es el que de verdad se pagó por ella, no un promedio
				inventado.
			</p>
			<p>
				Al registrar una compra se puede subir el <strong>XML del CFDI</strong> del proveedor —
				el sistema lee proveedor, folio fiscal y renglones automáticamente, para no
				retipearlos. El mismo CFDI no se puede recibir dos veces.
			</p>
			<p>
				<strong>Importar un CFDI directo a una cotización</strong> es otro camino: en vez de
				solo recibir a inventario, ese mismo XML arma los renglones de la cotización de un
				cliente. Cada renglón puede, además:
			</p>
			<ul class="ml-4 list-disc space-y-1">
				<li>marcarse para que TAMBIÉN entre a inventario (abre su propia capa), o</li>
				<li>
					agruparse con otros renglones en <strong>un solo paquete</strong> con su propio nombre
					y precio — para eso hay que marcar la casilla "Agrupar en un paquete" en CADA
					renglón que va dentro; si solo se llena el nombre y precio del paquete pero ningún
					renglón está marcado, el sistema ahora lo rechaza con un error en vez de cobrar cada
					renglón por separado a su precio individual.
				</li>
			</ul>
		</div>
	</details>

	<!-- Talleres aliados --------------------------------------------------------------------------->
	<details
		id="talleres"
		class="group rounded-lg border border-sand-200 bg-white p-5 open:pb-5"
	>
		<summary class="flex cursor-pointer list-none items-center justify-between gap-3">
			<h2 class="font-display text-lg text-sand-950">8. Talleres aliados</h2>
			<span class="text-sand-400 group-open:rotate-180">▾</span>
		</summary>
		<div class="mt-3 space-y-3 text-sm text-sand-700">
			<p>
				Cuando un trabajo se manda fuera (hojalatería, transmisiones, lo que no se hace en
				casa), la nota pasa a "En taller externo" y queda ligada a ese taller aliado. Un
				taller puede aplicar directamente desde el sitio público — llega como
				<Badge tone="warn">Solicitado</Badge> y hay que revisarlo y certificarlo antes de
				poder mandarle trabajo.
			</p>
			<p>
				Un taller puede tener varias sucursales; siempre hay exactamente una marcada como
				matriz.
			</p>
		</div>
	</details>

	<!-- Clientes y unidades -------------------------------------------------------------------->
	<details
		id="clientes"
		class="group rounded-lg border border-sand-200 bg-white p-5 open:pb-5"
	>
		<summary class="flex cursor-pointer list-none items-center justify-between gap-3">
			<h2 class="font-display text-lg text-sand-950">9. Clientes y unidades</h2>
			<span class="text-sand-400 group-open:rotate-180">▾</span>
		</summary>
		<div class="mt-3 space-y-3 text-sm text-sand-700">
			<p>
				Un cliente puede ser una persona o una organización (empresa, flotilla). Una
				organización no puede autorizar nada por sí misma — necesita contactos con nombre y
				rol: quién puede <strong>entregar/recoger</strong> la unidad, quién puede
				<strong>autorizar</strong> cotizaciones, y quién ve solo la parte de
				<strong>facturación</strong>.
			</p>
			<p>
				Cada unidad guarda su historial de kilometraje y su dueño puede cambiar con el tiempo
				(se registra cuándo y por qué) sin perder el historial de servicios anteriores.
			</p>
		</div>
	</details>

	<!-- Notificaciones ------------------------------------------------------------------------->
	<details
		id="notificaciones"
		class="group rounded-lg border border-sand-200 bg-white p-5 open:pb-5"
	>
		<summary class="flex cursor-pointer list-none items-center justify-between gap-3">
			<h2 class="font-display text-lg text-sand-950">10. Avisos y notificaciones</h2>
			<span class="text-sand-400 group-open:rotate-180">▾</span>
		</summary>
		<div class="mt-3 space-y-3 text-sm text-sand-700">
			<p>
				La campana del panel avisa de lo que pasa en el taller: cotizaciones respondidas,
				pagos registrados, estimaciones resueltas, entre otras. El cliente recibe las suyas
				por correo y, si activó notificaciones push en su liga de seguimiento, también ahí —
				sin necesitar cuenta ni contraseña.
			</p>
			<p>
				Un mecánico nunca ve montos de dinero en sus avisos, aunque el evento sea sobre su
				propio trabajo — solo la parte que le toca (por ejemplo, que su estimación fue
				aprobada, no por cuánto).
			</p>
		</div>
	</details>

	<!-- Permisos (admin) ------------------------------------------------------------------------->
	<details
		id="permisos"
		class="group rounded-lg border border-sand-200 bg-white p-5 open:pb-5"
	>
		<summary class="flex cursor-pointer list-none items-center justify-between gap-3">
			<h2 class="font-display text-lg text-sand-950">11. Roles y permisos</h2>
			<span class="text-sand-400 group-open:rotate-180">▾</span>
		</summary>
		<div class="mt-3 space-y-3 text-sm text-sand-700">
			<p>Cuatro roles fijos, en orden de alcance: Admin, Gerente, Operador, Taller (mecánico).</p>
			<p>
				Lo que cada uno puede hacer no está fijo en el código — se edita desde
				<strong>Permisos</strong> (solo Admin), permiso por permiso, sin tocar nada técnico.
				Un permiso ausente se niega por defecto: nada se abre "por si acaso". La única
				excepción es "Permisos: administrar" en sí mismo — Admin nunca puede quitárselo a
				Admin, para que nadie quede sin forma de corregir un error de configuración.
			</p>
			<p>
				Un mecánico (Taller) nunca ve precios, costos ni márgenes en ninguna pantalla — ni
				siquiera en sus propias notas. Esa es una regla del sistema, no una casilla que se
				pueda desmarcar.
			</p>
		</div>
	</details>
</div>
