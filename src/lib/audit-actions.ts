/**
 * The audit action registry. Every state-changing operation in the system appears here.
 *
 * Key format: `<entity>.<action>`. The label is what the Auditoría screen and its filter
 * dropdown show. Safe to import from the browser: data only.
 *
 * ADDING A CRUD OPERATION? Add its actions here in the same change that adds the
 * operation — see CLAUDE.md Rule 3. An unregistered action still records fine, it just
 * renders as its raw key and cannot be picked from the filter.
 */
export const AUDIT_ACTIONS = {
	"user.role_change": "Cambio de rol",
	"user.ban": "Usuario bloqueado",
	"user.unban": "Usuario desbloqueado",
	"invitation.create": "Invitación creada",
	"invitation.revoke": "Invitación revocada",
	"invitation.accept": "Invitación aceptada",
	"cliente.create": "Cliente creado",
	"cliente.update": "Cliente actualizado",
	"cliente.archive": "Cliente archivado",
	"cliente.restore": "Cliente restaurado",
	"cliente.delete": "Cliente eliminado",
	"contacto.create": "Contacto creado",
	"contacto.update": "Contacto actualizado",
	"contacto.delete": "Contacto eliminado",
	"unidad.create": "Unidad creada",
	"unidad.update": "Unidad actualizada",
	"unidad.archive": "Unidad archivada",
	"unidad.restore": "Unidad restaurada",
	"unidad.delete": "Unidad eliminada",
	"unidad.transfer": "Unidad transferida",
	// The public form. Recorded with a null actor — see recordAudit.
	"cita.solicitud": "Cita solicitada (público)",
	"cita.create": "Cita creada",
	"cita.link": "Cita vinculada a cliente y unidad",
	"cita.update": "Cita actualizada",
	"cita.confirm": "Cita confirmada",
	"cita.assign": "Cita asignada",
	"cita.advance": "Cita avanzada",
	"cita.cancel": "Cita cancelada",
	"cita.receive": "Unidad recibida (nota abierta)",
	"nota.create": "Nota de servicio abierta",
	"nota.update": "Nota de servicio actualizada",
	"nota.inspect": "Inspección de entrada",
	"nota.advance": "Nota avanzada",
	"nota.transfer": "Nota enviada a taller",
	"nota.return": "Nota devuelta del taller",
	"nota.qa": "Control de calidad al regresar del taller",
	"nota.comment": "Comentario en nota",
	"nota.evidence": "Evidencia adjuntada",
	"nota.evidence_delete": "Evidencia eliminada",
	"nota.close": "Nota entregada y cerrada",
	"nota.cancel": "Nota cancelada",
	"taller.create": "Taller aliado dado de alta",
	"taller.update": "Taller aliado actualizado",
	"taller.archive": "Taller aliado archivado",
	// The public /talleres application. Recorded with a null actor, same as cita.solicitud.
	"taller.solicitud": "Taller solicitó certificarse (público)",
	"taller.approve": "Taller certificado",
	"taller.reject": "Solicitud de taller rechazada",
	"sucursal.create": "Sucursal de taller creada",
	"sucursal.update": "Sucursal de taller actualizada",
	"sucursal.archive": "Sucursal de taller archivada",
	"notificacion.send": "Aviso enviado a mano",
	"notificacion.preferencias": "Preferencias de avisos actualizadas",
	"push.subscribe": "Dispositivo registrado para avisos",
	"push.unsubscribe": "Dispositivo dado de baja de avisos",
	"nota.seguimiento": "Liga de seguimiento regenerada",
	"unidad.kilometraje": "Kilometraje registrado",
	"cotizacion.create": "Cotización creada",
	"cotizacion.update": "Cotización actualizada",
	"cotizacion.send": "Cotización enviada al cliente",
	"cotizacion.authorize": "Cotización autorizada por el cliente",
	"cotizacion.reject": "Cotización rechazada",
	"factura.create": "Factura emitida",
	"factura.cancel": "Factura cancelada",
	"pago.register": "Pago registrado",
	"cliente.credito": "Condiciones de crédito actualizadas",
	"cliente.credito_override": "Venta a crédito autorizada sobre el límite",
} as const satisfies Record<string, string>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** Entities that appear in the log, derived from the action keys. */
export const AUDIT_ENTITIES = [
	...new Set(Object.keys(AUDIT_ACTIONS).map((key) => key.split(".")[0])),
] as string[];

export const auditActionLabel = (action: string): string =>
	(AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
