import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";

// The `reporteIA` action calls an external LLM (up to 45s internally, see src/lib/server/ia) —
// raises this route's ceiling on Vercel so that call isn't cut short. Every other action here
// returns in milliseconds regardless; this only raises the cap, not a floor.
export const config = { maxDuration: 60 };

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
	generarReporteIA,
	getNotaDetalle,
	listReportesIA,
	guardarLiberacion,
	inspeccionarNota,
	recibirDeTaller,
	transferirNota,
} from "$lib/server/notas";
import {
	agregarConceptosDesdeCompra,
	avanzarInterno,
	cambiarEstadoCotizacion,
	cancelarFactura,
	crearCotizacion,
	crearCotizacionInterna,
	crearFactura,
	listCotizaciones,
	listCotizacionesInternas,
	listFacturas,
	registrarPago,
	reenviarCotizacionCorreo,
	resolverCotizacionInterna,
	saldoCliente,
	surtirCotizacion,
	utilidadDeCotizacion,
	vincularCotizacionInterna,
} from "$lib/server/comercial";
import { listSolicitudes, registrarCompra, resolverSolicitud } from "$lib/server/inventario";
import { crearProducto, listProductos } from "$lib/server/productos";
import { fallo } from "$lib/server/errores";
import { cancelarEnSat, timbrarFactura } from "$lib/server/timbrado";
import { leerCfdi } from "$lib/cfdi";
import { ClienteError } from "$lib/server/clientes";

async function productosEmparejablesCfdi() {
	const rows = await prisma.producto.findMany({
		where: { archivedAt: null, controlaInventario: true },
		select: { id: true, sku: true, nombre: true, precioVenta: true, _count: { select: { componentes: true } } },
	});
	// A package never carries its own stock — it cannot be the target of a purchase line.
	return rows.filter((p) => p._count.componentes === 0);
}

export const load: ServerLoad = async ({ locals, params, url }) => {
	const actor = requirePermission(locals, "nota:read");
	const detalle = await getNotaDetalle(params.id!);
	const { nota } = detalle;

	// Preview drawer for a warranty-linked note (either direction of the thread): basic info only
	// — comments, diagnosis, cotizaciones, talleres involucrados — never the whole detail screen,
	// so clicking a related note doesn't lose your place on this one.
	const verGarantiaId = url.searchParams.get("verGarantia");
	let notaGarantia: (Awaited<ReturnType<typeof getNotaDetalle>> & { cotizaciones: unknown[] }) | null = null;
	if (verGarantiaId && (verGarantiaId === nota.garantiaDeId || nota.garantias.some((g) => g.id === verGarantiaId))) {
		try {
			const ajena = await getNotaDetalle(verGarantiaId);
			notaGarantia = {
				...ajena,
				cotizaciones: can(actor.role, "cotizacion:read")
					? (await listCotizaciones({ notaId: verGarantiaId, perPage: 50 })).cotizaciones
					: [],
			};
		} catch {
			notaGarantia = null;
		}
	}

	const [talleres, contactos, faltantes, cotizaciones, facturas, credito, solicitudes, catalogo, cotizacionesInternas, mecanicos] =
		await Promise.all([
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
			can(actor.role, "cotizacion_interna:read") ? listCotizacionesInternas(actor, { notaId: nota.id }) : [],
			// The mechanic picker for a cost estimate — a scoped direct query, not `listUsers`, so
			// this screen needs no `user:list` permission of its own.
			can(actor.role, "cotizacion_interna:create")
				? prisma.user.findMany({
						where: { role: "taller", NOT: { banned: true } },
						orderBy: { name: "asc" },
						select: { id: true, name: true },
					})
				: [],
		]);

	// Utilidad is per-cotización and Admin-only (`cotizacion:costo`) — computed here rather than
	// stored, so approving/rejecting an estimate later is reflected without a resync step.
	const utilidades: Record<string, Awaited<ReturnType<typeof utilidadDeCotizacion>>> = {};
	if (can(actor.role, "cotizacion:costo")) {
		for (const c of cotizaciones?.cotizaciones ?? []) {
			utilidades[c.id] = await utilidadDeCotizacion(actor, c.id);
		}
	}

	// `saldoCents`/`limiteCents` are internal bigints and must not cross to the browser.
	const creditoPublico = credito ? (({ saldoCents: _s, limiteCents: _l, ...resto }) => resto)(credito) : null;

	const reportesIA = can(actor.role, "nota:reporte_ia") ? await listReportesIA(actor, nota.id) : [];

	return {
		...detalle,
		talleres,
		reportesIA,
		// Only contacts who may actually receive the unit; the server re-checks the same rule.
		entregadores: contactos
			.filter((c) => c.roles.includes("entregador"))
			.map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono })),
		autorizadores: contactos
			.filter((c) => c.roles.includes("autorizador"))
			.map((c) => ({ id: c.id, nombre: c.nombre })),
		faltantes,
		cotizaciones: cotizaciones?.cotizaciones ?? [],
		utilidades,
		cotizacionesInternas,
		mecanicos,
		notaGarantia,
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
			liberar: can(actor.role, "nota:liberacion"),
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
			cotizarInterna: can(actor.role, "cotizacion_interna:create"),
			aprobarInterna: can(actor.role, "cotizacion_interna:authorize"),
			verUtilidad: can(actor.role, "cotizacion:costo"),
			reporteIA: can(actor.role, "nota:reporte_ia"),
			comprarCfdi: can(actor.role, "cotizacion:create") && can(actor.role, "inventario:entrada"),
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
	 * A cost estimate, almost always relayed from a mechanic via WhatsApp. Same parallel-array
	 * shape as `cotizar`, but no `tipo` and the amount is `costoUnitario` — never a `precioUnitario`.
	 */
	costoInterno: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();

		const descripciones = data.getAll("descripcion");
		const conceptos = descripciones
			.map((descripcion, i) => ({
				descripcion,
				cantidad: data.getAll("cantidad")[i],
				costoUnitario: data.getAll("costoUnitario")[i],
				productoId: data.getAll("productoId")[i],
			}))
			.filter((c) => String(c.descripcion ?? "").trim() !== "" || String(c.productoId ?? "").trim() !== "");

		try {
			await crearCotizacionInterna({
				actor,
				notaId: params.id!,
				body: { mecanicoId: data.get("mecanicoId"), conceptos },
			});
			redirect(303, conFlash(`/panel/notas/${params.id}`, "cotizacion_interna.crear"));
		} catch (err) {
			return fallo(err);
		}
	},

	/** Approve or reject a submitted cost estimate. Rejecting requires a `motivo`. */
	costoInternoEstado: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			const estado = data.get("estado");
			await resolverCotizacionInterna({ actor, id: String(data.get("id")), estado, motivo: data.get("motivo") });
			redirect(
				303,
				conFlash(`/panel/notas/${params.id}`, estado === "aprobada" ? "cotizacion_interna.aprobar" : "cotizacion_interna.rechazar"),
			);
		} catch (err) {
			return fallo(err);
		}
	},

	/** Link (or unlink) an approved estimate to one of this nota's customer-facing cotizaciones. */
	costoInternoVincular: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			const cotizacionId = String(data.get("cotizacionId") ?? "").trim();
			await vincularCotizacionInterna({ actor, id: String(data.get("id")), cotizacionId: cotizacionId || null });
			redirect(303, conFlash(`/panel/notas/${params.id}`, "cotizacion_interna.vincular"));
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

	/** "El cliente dice que no le llegó" — manda el mismo correo de nuevo, sin tocar el estado. */
	reenviarCotizacionCorreo: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await reenviarCotizacionCorreo({ actor, id: String(data.get("cotizacionId")) });
			redirect(303, conFlash(`/panel/notas/${params.id}`, "cotizacion.reenviar"));
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

	liberacion: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		const body = Object.fromEntries(data) as Record<string, unknown>;
		body.unidadLiberada = data.get("unidadLiberada") === "1";
		try {
			await guardarLiberacion({ actor, id: params.id!, body });
			redirect(303, conFlash(`/panel/notas/${params.id}`, "nota.liberacion"));
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

	// Same shape as the global /panel/inventario/comprar-cfdi wizard (parse → review → confirm,
	// XML re-parsed server-side on confirm — never trusted from client-editable fields), but
	// nota-scoped and cotización-shaped instead of inventory-only. No redirect on either step:
	// the review table and the result both render inline via `form`, same as `reporteIA`.
	previsualizarCfdi: async ({ locals, request }) => {
		const actor = requirePermission(locals, "cotizacion:create");
		if (!can(actor.role, "inventario:entrada")) throw new ClienteError(403, "Sin permiso: inventario:entrada");

		const data = await request.formData();
		const archivo = data.get("cfdi");
		const xml = archivo instanceof File && archivo.size > 0 ? await archivo.text() : null;
		if (!xml) return fallo(new ClienteError(400, "Sube el XML del CFDI"));

		const cfdi = leerCfdi(xml);
		if (!cfdi) return fallo(new ClienteError(400, "Ese archivo no parece un CFDI."));
		if (cfdi.conceptos.length === 0) return fallo(new ClienteError(400, "El CFDI no trae conceptos que revisar."));

		const disponibles = await productosEmparejablesCfdi();
		const porSku = new Map(disponibles.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p]));
		const porNombre = new Map(disponibles.map((p) => [p.nombre.toLowerCase(), p]));

		const filas = cfdi.conceptos.map((c) => {
			const match =
				(c.noIdentificacion && porSku.get(c.noIdentificacion.toLowerCase())) ||
				(c.descripcion && porNombre.get(c.descripcion.toLowerCase())) ||
				null;
			const costoReferencia = c.valorUnitario !== null ? c.valorUnitario.toFixed(4) : "";
			return {
				claveProdServ: c.claveProdServ ?? "",
				noIdentificacion: c.noIdentificacion ?? "",
				cantidad: c.cantidad !== null ? c.cantidad.toFixed(3) : "",
				claveUnidad: c.claveUnidad ?? "H87",
				unidad: c.unidad ?? "",
				// The name staff sees on THIS row and the name the customer will read start the
				// same, but travel separately from here: `nombreCliente` is what gets typed over,
				// `descripcion` is only ever shown as read-only context.
				descripcion: c.descripcion ?? "",
				nombreCliente: match?.nombre ?? c.descripcion ?? "",
				costoReferencia,
				precioVenta: match ? Number(match.precioVenta).toFixed(2) : costoReferencia,
				matchId: match?.id ?? "",
			};
		});

		return {
			previewCfdi: true as const,
			xml,
			emisor: cfdi.emisorNombre,
			filas,
			catalogo: disponibles.map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku })),
		};
	},

	confirmarCfdi: async ({ locals, params, request }) => {
		const actor = requirePermission(locals, "cotizacion:create");
		if (!can(actor.role, "inventario:entrada")) throw new ClienteError(403, "Sin permiso: inventario:entrada");

		const notaId = params.id!;
		const data = await request.formData();
		const xml = String(data.get("xml") ?? "");
		const cfdi = leerCfdi(xml);
		if (!cfdi) return fallo(new ClienteError(400, "El XML de la revisión ya no es válido. Sube el CFDI de nuevo."));

		const productoId = data.getAll("productoId").map(String);
		const cantidad = data.getAll("cantidad").map(String);
		const costoUnitario = data.getAll("costoUnitario").map(String);
		const precioVenta = data.getAll("precioVenta").map(String);
		const nombreCliente = data.getAll("nombreCliente").map(String);
		const claveProdServ = data.getAll("claveProdServ").map(String);
		const claveUnidad = data.getAll("claveUnidad").map(String);
		const unidad = data.getAll("unidad").map(String);

		const disponibles = new Map((await productosEmparejablesCfdi()).map((p) => [p.id, p]));

		try {
			const lineasInventario: { productoId: string; cantidad: number; costoUnitario: number }[] = [];
			const conceptosCotizacion: Record<string, unknown>[] = [];

			// Rows checked "agrupar en un paquete" never become their own line — their cost feeds
			// the ONE combined line built after the loop. Ad-hoc only: nothing is saved to the
			// product catalog, this exists for this cotización alone.
			let costoPaquete = 0;
			let filasEnPaquete = 0;

			for (let i = 0; i < cantidad.length; i++) {
				if (data.get(`incluir_${i}`) !== "1") continue;
				if (!cantidad[i] || !precioVenta[i]) continue;

				let idProducto = productoId[i] || null;
				const agregarInventario = data.get(`agregarInventario_${i}`) === "1";
				const enPaquete = data.get(`paquete_${i}`) === "1";

				if (agregarInventario) {
					if (idProducto) {
						if (!disponibles.has(idProducto)) {
							return fallo(
								new ClienteError(400, `El renglón ${i + 1} apunta a un producto que ya no se puede recibir.`),
							);
						}
					} else {
						if (!nombreCliente[i]) {
							return fallo(
								new ClienteError(
									400,
									`El renglón ${i + 1}: dale un nombre para crear el producto, o quita "agregar a inventario".`,
								),
							);
						}
						const nuevo = await crearProducto({
							actor,
							body: {
								nombre: nombreCliente[i],
								tipo: "refaccion",
								claveProdServ: claveProdServ[i],
								claveUnidad: claveUnidad[i],
								unidad: unidad[i],
								precioVenta: precioVenta[i],
								controlaInventario: true,
							},
						});
						idProducto = nuevo.id;
					}
					lineasInventario.push({
						productoId: idProducto,
						cantidad: Number(cantidad[i]),
						costoUnitario: Number(costoUnitario[i] || 0),
					});
				}

				if (enPaquete) {
					costoPaquete += Number(cantidad[i]) * Number(costoUnitario[i] || 0);
					filasEnPaquete++;
					continue;
				}

				conceptosCotizacion.push({
					tipo: "refaccion",
					productoId: idProducto,
					descripcion: idProducto ? "" : nombreCliente[i] || "",
					cantidad: cantidad[i],
					precioUnitario: precioVenta[i],
					costoUnitario: costoUnitario[i] || undefined,
				});
			}

			if (filasEnPaquete > 0) {
				const paqueteNombre = String(data.get("paqueteNombre") ?? "").trim();
				const paquetePrecio = String(data.get("paquetePrecio") ?? "");
				if (!paqueteNombre || !paquetePrecio) {
					return fallo(
						new ClienteError(400, "Agrupaste renglones en un paquete — dale nombre y precio al paquete."),
					);
				}
				conceptosCotizacion.push({
					tipo: "refaccion",
					productoId: null,
					descripcion: paqueteNombre,
					cantidad: "1",
					precioUnitario: paquetePrecio,
					costoUnitario: costoPaquete > 0 ? costoPaquete.toFixed(4) : undefined,
				});
			}

			if (conceptosCotizacion.length === 0) {
				return fallo(new ClienteError(400, "No quedó ningún renglón seleccionado."));
			}

			const entrada = await registrarCompra({ actor, cfdiXml: xml, lineas: lineasInventario });

			const existente = await listCotizaciones({ notaId, estado: "borrador", perPage: 1 });
			if (existente.cotizaciones.length > 0) {
				await agregarConceptosDesdeCompra({
					actor,
					cotizacionId: existente.cotizaciones[0].id,
					entradaId: entrada.id,
					conceptos: conceptosCotizacion,
				});
			} else {
				await crearCotizacion({ actor, notaId, body: { conceptos: conceptosCotizacion }, entradaId: entrada.id });
			}
		} catch (err) {
			return fallo(err);
		}

		return { recibidoCfdi: true as const };
	},

	reporteIA: async ({ locals, params, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			const reporte = await generarReporteIA({
				actor,
				id: params.id!,
				comentarioIds: data.getAll("comentarioIds"),
				evidenciaIds: data.getAll("evidenciaIds"),
				cotizacionIds: data.getAll("cotizacionIds"),
				incluirDiagnostico: data.get("incluirDiagnostico") === "1",
			});
			// Its own page, not inline: a saved report needs a stable link to reference or share,
			// and rendering it on a dedicated page (nothing else on it) is what makes "print just
			// the report" trivial — there's no sibling content to hide from the print stylesheet.
			redirect(303, `/panel/notas/${params.id}/reporte-ia/${reporte.id}`);
		} catch (err) {
			return fallo(err);
		}
	},
};
