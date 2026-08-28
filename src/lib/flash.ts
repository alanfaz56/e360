/**
 * What a completed action says back.
 *
 * Every panel action ends in `redirect(303, …)` — that is what stops a refresh from repeating a
 * write — and a redirect throws away anything the action wanted to tell you. So the result travels
 * in the URL, `?ok=<clave>`, and `Flash.svelte` reads it back.
 *
 * The URL, not a store: it survives the redirect, it works with JavaScript off, it can be reloaded
 * and shared, and it is the same place drawers and filters already live. A store would need JS and
 * would be blank on the very page load that is supposed to be reporting the result.
 *
 * An unknown key still renders a generic confirmation rather than nothing — a message somebody
 * forgot to register is a worse failure than a vague one, because "nothing happened" is exactly
 * what the user must never be left thinking.
 *
 * Safe to import from the browser: data only.
 */

export const FLASH: Record<string, string> = {
	// --- Citas ---------------------------------------------------------------------------------
	"cita.crear": "Cita agendada.",
	"cita.editar": "Cita actualizada.",
	"cita.confirmar": "Cita confirmada con hora.",
	"cita.asignar": "Responsable asignado.",
	"cita.avanzar": "Estado de la cita actualizado.",
	"cita.cancelar": "Cita cancelada.",
	"cita.vincular": "Cliente y unidad vinculados.",
	"cita.asignarHora": "Hora asignada. Falta vincular cliente y unidad para que se confirme sola.",

	// --- Notas de servicio ---------------------------------------------------------------------
	"nota.recibir": "Unidad recibida. Levanta la inspección de entrada.",
	"nota.inspeccionar": "Inspección guardada.",
	"nota.avanzar": "Nota actualizada.",
	"nota.transferir": "Unidad enviada al taller aliado.",
	"nota.recibirTaller": "Recepción registrada con su control de calidad.",
	"nota.entregar": "Unidad entregada al cliente.",
	"nota.liberacion": "Checklist de liberación guardado.",
	"nota.cancelar": "Nota cancelada.",
	"nota.comentar": "Comentario agregado.",
	"nota.mecanico": "Mecánico asignado.",
	"nota.diagnostico": "Diagnóstico guardado.",
	"nota.evidencia": "Evidencia guardada.",
	"nota.terminar": "Trabajo marcado como terminado.",

	// --- Dinero --------------------------------------------------------------------------------
	"cotizacion.crear": "Cotización creada en borrador.",
	"cotizacion.estado": "Respuesta del cliente registrada.",
	"cotizacion.enviada": "Cotización marcada como enviada. Mándasela por WhatsApp.",
	"cotizacion.reenviar": "Correo reenviado.",
	"cotizacion.interno": "Avance interno registrado.",
	"cotizacion.surtir": "Refacciones surtidas del almacén.",
	"cotizacion_interna.crear": "Estimación de costo creada, pendiente de aprobación.",
	"cotizacion_interna.editar": "Estimación de costo actualizada.",
	"cotizacion_interna.vincular": "Estimación de costo ligada a la cotización.",
	"cotizacion_interna.aprobar": "Estimación de costo aprobada.",
	"cotizacion_interna.rechazar": "Estimación de costo rechazada.",
	"factura.crear": "Factura emitida.",
	"factura.cancelar": "Factura cancelada.",
	"factura.timbrar": "Factura timbrada. Ya tiene folio fiscal.",
	"factura.cancelarSat": "Cancelación enviada al SAT.",
	"pago.registrar": "Pago registrado.",
	"nota_venta.crear": "Nota de venta creada.",
	"nota_venta.cancelar": "Nota de venta cancelada.",

	// --- Ajustes del sistema ---------------------------------------------------------------------
	"ajuste.guardar": "Ajustes guardados.",
	"canal.webhook_registrado": "Webhook de Telegram registrado con esta URL.",
	"empresa.guardar": "Datos de la empresa guardados.",
	"cuentaBancaria.crear": "Cuenta bancaria agregada.",
	"cuentaBancaria.editar": "Cuenta bancaria actualizada.",
	"cuentaBancaria.archivar": "Cuenta bancaria archivada.",
	"cuentaBancaria.restaurar": "Cuenta bancaria restaurada.",
	"permisos.guardar": "Permisos actualizados.",

	// --- Inventario y catálogo -----------------------------------------------------------------
	"producto.crear": "Producto dado de alta.",
	"producto.editar": "Producto actualizado.",
	"producto.archivar": "Producto archivado.",
	"producto.restaurar": "Producto restaurado.",
	"inventario.entrada": "Entrada registrada. Se abrió una capa de costo.",
	"inventario.ajuste": "Ajuste aplicado.",
	"inventario.solicitud": "Solicitud de refacción registrada.",
	"inventario.surtida": "Solicitud surtida.",
	"inventario.rechazada": "Solicitud rechazada.",

	// --- Talleres aliados ----------------------------------------------------------------------
	"taller.crear": "Taller dado de alta.",
	"taller.editar": "Taller actualizado.",
	"taller.revisar": "Decisión registrada.",
	"taller.sucursal": "Sucursal guardada.",
	"taller.mecanico": "Cuadrilla del taller actualizada.",

	// --- Clientes ------------------------------------------------------------------------------
	"cliente.crear": "Cliente dado de alta.",

	// --- Recordatorios ---------------------------------------------------------------------------
	"recordatorio.crear": "Recordatorio agregado.",
	"recordatorio.marcar": "Recordatorio marcado.",
	"recordatorio.reabrir": "Recordatorio reabierto.",

	// --- Avisos --------------------------------------------------------------------------------
	"aviso.leidos": "Avisos marcados como leídos.",
	"aviso.enviado": "Aviso enviado.",
	"aviso.preferencias": "Preferencias guardadas.",
	"aviso.dispositivo": "Dispositivo dado de baja.",

	// --- Proveedores -----------------------------------------------------------------------------
	"proveedor.crear": "Proveedor dado de alta.",
	"proveedor.editar": "Datos del proveedor actualizados.",
	"proveedor.asignarTaller": "Taller asignado al proveedor.",
	"proveedor.quitarTaller": "Taller quitado del proveedor.",
};

export const flashMensaje = (clave: string | null): string | null =>
	clave === null ? null : (FLASH[clave] ?? "Listo.");

/** `/panel/notas/abc` + `nota.inspeccionar` → `/panel/notas/abc?ok=nota.inspeccionar` */
export const conFlash = (ruta: string, clave: keyof typeof FLASH | (string & {})): string =>
	`${ruta}${ruta.includes("?") ? "&" : "?"}ok=${encodeURIComponent(clave)}`;
