import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { hoy } from "$lib/agenda";
import { conFlash } from "$lib/flash";
import prisma from "$lib/prisma";
import { NOTA_TRANSICIONES, type NotaEstado } from "$lib/notas";
import { can } from "$lib/roles";
import { listContactos } from "$lib/server/contactos";
import { listTalleres } from "$lib/server/talleres";
import { requirePermission, requireUser } from "$lib/server/guard";
import { r2Configurado } from "$lib/server/r2";
import {
	avanzarNota,
	cancelarNota,
	capturarDiagnostico,
	comentarNota,
	entregarNota,
	faltantesInventario,
	getNotaDetalle,
	inspeccionarNota,
	recibirDeTaller,
	transferirNota,
} from "$lib/server/notas";
import {
	avanzarInterno,
	cambiarEstadoCotizacion,
	cancelarFactura,
	crearCotizacion,
	crearFactura,
	listCotizaciones,
	listFacturas,
	registrarPago,
	saldoCliente,
	surtirCotizacion,
} from "$lib/server/comercial";
import { listSolicitudes, resolverSolicitud } from "$lib/server/inventario";
import { listProductos } from "$lib/server/productos";
import { fallo } from "$lib/server/errores";
import { cancelarEnSat, timbrarFactura } from "$lib/server/timbrado";

export const load: ServerLoad = async ({ locals, params }) => {
	const actor = requirePermission(locals, "nota:read");
	const detalle = await getNotaDetalle(params.id!);
	const { nota } = detalle;

	const [talleres, contactos, faltantes, cotizaciones, facturas, credito, solicitudes, catalogo] = await Promise.all([
		can(actor.role, "taller:read")
			? (await listTalleres({ perPage: 100 })).talleres.filter((t) => !t.archivado)
			: [],
		listContactos(nota.clienteId),
		faltantesInventario(nota.id),
		can(actor.role, "cotizacion:read") ? listCotizaciones({ notaId: nota.id, perPage: 50 }) : null,
		can(actor.role, "factura:read") ? listFacturas({ notaId: nota.id, perPage: 50 }) : null,
		can(actor.role, "factura:read") ? saldoCliente(nota.clienteId) : null,
		can(actor.role, "inventario:solicitar") ? listSolicitudes({ notaId: nota.id }) : [],
		// The quote builder's catalogue. Only fetched for somebody who can actually quote, and
		// only the live rows — an archived product is refused by `resolverProductos` anyway, so
		// offering it would be a button that always fails.
		can(actor.role, "cotizacion:create") && can(actor.role, "producto:read")
			? listProductos({ perPage: 200 })
			: null,
	]);

	// `saldoCents`/`limiteCents` are internal bigints and must not cross to the browser.
	const creditoPublico = credito ? (({ saldoCents: _s, limiteCents: _l, ...resto }) => resto)(credito) : null;

	return {
		...detalle,
		talleres,
		// Only contacts who may actually receive the unit; the server re-checks the same rule.
		entregadores: contactos
			.filter((c) => c.roles.includes("entregador"))
			.map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono })),
		autorizadores: contactos
			.filter((c) => c.roles.includes("autorizador"))
			.map((c) => ({ id: c.id, nombre: c.nombre })),
		faltantes,
		cotizaciones: cotizaciones?.cotizaciones ?? [],
		facturas: facturas?.facturas ?? [],
		credito: creditoPublico,
		solicitudes,
		// Trimmed to what the picker draws: a price and a stock figure per row, nothing else.
		productos: (catalogo?.productos ?? [])
			.filter((p) => !p.archivado)
			.map((p) => ({
				id: p.id,
				nombre: p.nombre,
				tipo: p.tipo,
				precioVenta: p.precioVenta,
				unidad: p.unidad,
				existencia: p.existencia,
				controlaInventario: p.controlaInventario,
			})),
		r2: r2Configurado(),
		// The shop's date, not the browser's — a payment dated by a laptop set to CDMX would land
		// on the wrong day for the counter. Same rule the agenda follows.
		hoy: hoy(),
		// The unit's last odometer, so every field that asks for one comes prefilled. Asking
		// somebody to retype a number the system already holds is how a digit goes missing.
		kilometrajeUnidad: detalle.nota.unidadId
			? ((
					await prisma.unidad.findUnique({
						where: { id: detalle.nota.unidadId },
						select: { kilometraje: true },
					})
				)?.kilometraje ?? null)
			: null,
		// Estados reachable from here through the plain "advance" action. Transfer, delivery and
		// cancellation are excluded on purpose: each needs more than a status.
		siguientes: (NOTA_TRANSICIONES[nota.estado as NotaEstado] ?? []).filter(
			(e) => e !== "cancelada" && e !== "entregada" && e !== "en_taller",
		),
		puede: {
			inspeccionar: can(actor.role, "nota:inspect"),
			avanzar: can(actor.role, "nota:advance"),
			transferir: can(actor.role, "nota:transfer"),
			comentar: can(actor.role, "nota:comment"),
			entregar: can(actor.role, "nota:close"),
			cancelar: can(actor.role, "nota:cancel"),
			cotizar: can(actor.role, "cotizacion:create"),
			// Telling the customer something is its own key: an Operador may build and record the
			// answer to a quote, but sending it out is Admin/Gerente.
			enviarCotizacion: can(actor.role, "cotizacion:send"),
			facturar: can(actor.role, "factura:create"),
			cancelarFactura: can(actor.role, "factura:cancel"),
			// Stamping is its own key: it is irreversible and it spends a timbre.
			timbrar: can(actor.role, "factura:timbrar"),
			credito: can(actor.role, "cliente:credito"),
			cobrar: can(actor.role, "pago:register"),
			verDinero: can(actor.role, "factura:read"),
			interno: can(actor.role, "cotizacion:interno"),
			surtir: can(actor.role, "inventario:salida"),
		},
	};
};

/** Every action routes through the same shared function the API route calls (Rule 4). */
export const actions: Actions = {
	/** The counter can write the diagnosis too — not every shop has the mechanic typing. */
	diagnostico: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await capturarDiagnostico({ actor, id: params.id!, diagnostico: data.get("diagnostico") });
			redirect(303, conFlash(`/panel/notas/${params.id}`, "nota.diagnostico"));
		} catch (err) {
			return fallo(err);
		}
	},

	/**
	 * Build a quote, line by line.
	 *
	 * The rows arrive as parallel arrays (`tipo[]`, `descripcion[]`, …) because that is what a plain
	 * `<form>` can post — no JSON, no client framework. They are zipped back into objects here and
	 * handed to the SAME `crearCotizacion` the API route calls, so the money rules (totals always
	 * recomputed, SAT keys copied onto the line) cannot drift between the two paths.
	 *
	 * Empty rows are dropped rather than rejected: the form ships blank rows so a no-JS user can add
	 * several lines, and "I only needed two" must not be an error.
	 */
	cotizar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();

		const tipos = data.getAll("tipo");
		const conceptos = tipos
			.map((tipo, i) => ({
				tipo,
				descripcion: data.getAll("descripcion")[i],
				cantidad: data.getAll("cantidad")[i],
				precioUnitario: data.getAll("precioUnitario")[i],
				productoId: data.getAll("productoId")[i],
			}))
			.filter((c) => String(c.descripcion ?? "").trim() !== "" || String(c.productoId ?? "").trim() !== "");

		try {
			await crearCotizacion({
				actor,
				notaId: params.id!,
				body: { conceptos, vigenciaHasta: data.get("vigenciaHasta"), notas: data.get("notas") },
			});
			redirect(303, conFlash(`/panel/notas/${params.id}`, "cotizacion.crear"));
		} catch (err) {
			return fallo(err);
		}
	},

	/**
	 * The CUSTOMER's axis: sent, authorised, rejected, expired.
	 *
	 * Separate from `interno` on purpose — telling the customer something and moving the shop's own
	 * track are different decisions with different permissions (`cotizacion:send` vs
	 * `cotizacion:interno`), and `cambiarEstadoCotizacion` picks the right one per destination.
	 */
	estadoCotizacion: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await cambiarEstadoCotizacion({
				actor,
				id: String(data.get("cotizacionId")),
				estado: data.get("estado"),
				body: {
					motivo: data.get("motivo"),
					contactoId: data.get("contactoId"),
					medio: data.get("medio"),
				},
			});
			redirect(303, conFlash(`/panel/notas/${params.id}`, "cotizacion.estado"));
		} catch (err) {
			return fallo(err);
		}
	},

	/**
	 * Issue the invoice for an authorised quote.
	 *
	 * Nothing is stamped: there is no CFDI here yet, only the receivable. `crearFactura` copies the
	 * customer's credit terms onto the row at issue, so changing their limit later never rewrites
	 * what was already agreed — and the limit check runs INSIDE its transaction.
	 */
	facturar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await crearFactura({
				actor,
				body: {
					cotizacionId: data.get("cotizacionId"),
					notaId: params.id!,
					condicionPago: data.get("condicionPago"),
					serie: data.get("serie"),
					notas: data.get("notas"),
					// Over the limit is a 409 naming the overage; forcing it is its own audit entry.
					forzarCredito: data.get("forzarCredito"),
					motivoCredito: data.get("motivoCredito"),
				},
			});
			redirect(303, conFlash(`/panel/notas/${params.id}`, "factura.crear"));
		} catch (err) {
			return fallo(err);
		}
	},

	/** Take money at the counter. `pagada` and `cobrada` both fall out of the arithmetic. */
	pagar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await registrarPago({
				actor,
				facturaId: String(data.get("facturaId")),
				body: {
					monto: data.get("monto"),
					metodo: data.get("metodo"),
					referencia: data.get("referencia"),
					pagadoAt: data.get("pagadoAt"),
					notas: data.get("notas"),
				},
			});
			redirect(303, conFlash(`/panel/notas/${params.id}`, "pago.registrar"));
		} catch (err) {
			return fallo(err);
		}
	},

	/** Refused once payments exist — that case is a credit note, which is a different document. */
	cancelarFactura: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await cancelarFactura({ actor, id: String(data.get("facturaId")), motivo: data.get("motivo") });
			redirect(303, conFlash(`/panel/notas/${params.id}`, "factura.cancelar"));
		} catch (err) {
			return fallo(err);
		}
	},

	/**
	 * Stamp at the SAT. Same shared function the API route calls (Rule 4).
	 *
	 * No confirmation drawer, deliberately: everything the CFDI needs is already on the invoice and
	 * there is nothing left to ask. What protects against a stray click is that the button only
	 * renders for `factura:timbrar`, and that a second click answers 409 with the UUID it already
	 * has rather than spending another timbre.
	 */
	timbrar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await timbrarFactura({ actor, id: String(data.get("facturaId")) });
			redirect(303, conFlash(`/panel/notas/${params.id}`, "factura.timbrar"));
		} catch (err) {
			return fallo(err);
		}
	},

	/**
	 * Cancel a STAMPED invoice: the SAT first, our row after.
	 *
	 * `motivo` is the SAT's clave (01–04) and `explicacion` is ours in words — the clave says which
	 * box was ticked, never why. A cancellation the SAT holds pending leaves the document live, and
	 * `cancelarEnSat` refuses to mark the row cancelled until it is not.
	 */
	cancelarSat: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await cancelarEnSat({
				actor,
				id: String(data.get("facturaId")),
				motivo: data.get("motivo"),
				sustituye: data.get("sustituye"),
				explicacion: data.get("explicacion"),
			});
			redirect(303, conFlash(`/panel/notas/${params.id}`, "factura.cancelarSat"));
		} catch (err) {
			return fallo(err);
		}
	},

	/** Move a quote along the SHOP's track: en_proceso → completada → por_cobrar. */
	interno: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await avanzarInterno({ actor, id: String(data.get("cotizacionId")), estado: data.get("estado") });
			redirect(303, conFlash(`/panel/notas/${params.id}`, "cotizacion.interno"));
		} catch (err) {
			return fallo(err);
		}
	},

	/** Issue the parts a quote calls for, FIFO. All or nothing. */
	surtir: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await surtirCotizacion({ actor, id: String(data.get("cotizacionId")) });
			redirect(303, conFlash(`/panel/notas/${params.id}`, "cotizacion.surtir"));
		} catch (err) {
			return fallo(err);
		}
	},

	resolverRefaccion: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await resolverSolicitud({
				actor,
				id: String(data.get("id")),
				estado: String(data.get("estado")),
				motivo: data.get("motivo"),
			});
			redirect(303, conFlash(`/panel/notas/${params.id}`, "inventario.surtida"));
		} catch (err) {
			return fallo(err);
		}
	},
	inspeccionar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		const body = Object.fromEntries(data) as Record<string, unknown>;
		// Checkboxes only post when checked, so an unchecked box means "not present" rather than
		// "not answered" — the form always submits the full catalogue via hidden fields.
		body.inventario = Object.fromEntries(
			data
				.getAll("inventarioItem")
				.map((k) => [String(k), data.getAll("inventario").includes(String(k)) ? "si" : "no"]),
		);
		try {
			await inspeccionarNota({ actor, id: params.id!, body });
			redirect(303, conFlash(`/panel/notas/${params.id}`, "nota.inspeccionar"));
		} catch (err) {
			return fallo(err);
		}
	},

	avanzar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await avanzarNota({ actor, id: params.id!, estado: data.get("estado") });
			redirect(303, conFlash(`/panel/notas/${params.id}`, "nota.avanzar"));
		} catch (err) {
			return fallo(err);
		}
	},

	/** The unit came back from a partner shop — QA is what closes the transfer. */
	recibirTaller: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await recibirDeTaller({
				actor,
				id: params.id!,
				qaResultado: data.get("qaResultado"),
				destino: data.get("destino"),
				qaNotas: data.get("qaNotas"),
				resultado: data.get("resultado"),
				kilometraje: data.get("kilometraje"),
			});
			redirect(303, conFlash(`/panel/notas/${params.id}`, "nota.recibirTaller"));
		} catch (err) {
			return fallo(err);
		}
	},

	transferir: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await transferirNota({
				actor,
				id: params.id!,
				tallerId: data.get("tallerId"),
				motivo: data.get("motivo"),
			});
			redirect(303, conFlash(`/panel/notas/${params.id}`, "nota.transferir"));
		} catch (err) {
			return fallo(err);
		}
	},

	comentar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await comentarNota({
				actor,
				id: params.id!,
				texto: data.get("texto"),
				interno: data.get("interno") === "1",
				// `getAll`: the attach control emits one hidden input per file, so a single `get`
				// would silently keep the first and drop the rest.
				adjuntos: data.getAll("adjuntos"),
			});
			redirect(303, conFlash(`/panel/notas/${params.id}`, "nota.comentar"));
		} catch (err) {
			return fallo(err);
		}
	},

	entregar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await entregarNota({
				actor,
				id: params.id!,
				contactoId: data.get("contactoId"),
				observaciones: data.get("observaciones"),
			});
			redirect(303, conFlash(`/panel/notas/${params.id}`, "nota.entregar"));
		} catch (err) {
			return fallo(err);
		}
	},

	cancelar: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await cancelarNota({ actor, id: params.id!, motivo: data.get("motivo") });
			redirect(303, conFlash(`/panel/notas/${params.id}`, "nota.cancelar"));
		} catch (err) {
			return fallo(err);
		}
	},
};
