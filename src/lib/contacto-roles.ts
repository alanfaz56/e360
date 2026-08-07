/**
 * Roles a customer contact can hold. A person may hold several.
 *
 * `autoridad` marks the roles that let someone act on the customer's behalf — take a
 * vehicle away, or approve money being spent. Those are the ones a front-desk Operador
 * cannot grant alone; see `canAssignContactoRole` in src/lib/roles.ts.
 *
 * Keys are mirrored by a CHECK constraint on cliente_contacto.roles. Adding a role here
 * means a migration that widens that constraint too.
 *
 * Safe to import from the browser: data only.
 */
export const CONTACTO_ROLES = {
	entregador: { label: "Entregador", autoridad: true, descripcion: "Puede recoger una unidad y firmar la entrega" },
	autorizador: { label: "Autorizador", autoridad: true, descripcion: "Puede autorizar cotizaciones y reparaciones" },
	facturacion: { label: "Facturación", autoridad: false, descripcion: "Recibe la factura y ve temas de cobranza" },
	general: { label: "Contacto general", autoridad: false, descripcion: "Solo un teléfono de contacto" },
} as const satisfies Record<string, { label: string; autoridad: boolean; descripcion: string }>;

export type ContactoRole = keyof typeof CONTACTO_ROLES;

export const CONTACTO_ROLE_KEYS = Object.keys(CONTACTO_ROLES) as ContactoRole[];

export function isContactoRole(value: unknown): value is ContactoRole {
	return typeof value === "string" && Object.hasOwn(CONTACTO_ROLES, value);
}

/** Roles that let the holder act on the customer's behalf. */
export function esRolDeAutoridad(role: string): boolean {
	return isContactoRole(role) && CONTACTO_ROLES[role].autoridad;
}

export const contactoRoleLabel = (role: string): string => (isContactoRole(role) ? CONTACTO_ROLES[role].label : role);
