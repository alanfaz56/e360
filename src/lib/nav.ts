import type { Permission } from "./roles";

/**
 * Sidebar sections. Each one is gated by a permission from the registry, so a role that
 * cannot use a screen never sees its link. The server filters this list before it
 * reaches the browser — hiding a link is a courtesy, the route guards are the control.
 *
 * `icon` is a key, not a component: this data crosses the server/client boundary and has
 * to stay serializable. src/lib/components/Icon.svelte maps keys to lucide components.
 */
export type NavItem = {
	href: string;
	label: string;
	icon:
		| "users"
		| "contact"
		| "car"
		| "scroll-text"
		| "layout-dashboard"
		| "chart-column"
		| "calendar-days"
		| "list"
		| "clipboard-list"
		| "receipt-text"
		| "wrench"
		| "package"
		| "settings"
		| "bell"
		| "landmark"
		| "shield-check"
		| "sparkles"
		| "truck"
		| "message-circle"
		| "circle-help"
		| "credit-card";
	permission: Permission;
	/**
	 * Collapses this entry into an accordion with every other item sharing the same label —
	 * consecutive entries only (the array's own order IS the grouping, see NAV below). An item
	 * with no `grupo` renders flat, same as before: the daily-driver screens stay one click away
	 * instead of behind a fold, and only the lower-frequency clusters collapse to save the
	 * vertical space an 18-row rail was costing on a phone.
	 */
	grupo?: string;
	/**
	 * Hide the entry from anybody who ALSO holds this permission.
	 *
	 * For the one case where a narrow screen and a wide one overlap: "Mi trabajo" lists the notes
	 * assigned to you, and everybody technically holds `nota:asignadas` — but a Gerente is not a
	 * mechanic and already has the whole floor two rows down. Showing both is clutter, and gating
	 * the narrow screen on a permission only one role holds would be a lie about what it does.
	 */
	ocultarSi?: Permission;
	/**
	 * Additionally require the caller to be on the `OWNER_EMAILS` list.
	 *
	 * For the settings screen, which is Admin in the registry AND narrowed to whoever runs the
	 * software. Hiding the link is a courtesy as always; `requireDueno` on the route is the
	 * control, and it answers 404 rather than 403 so the screen is not even discoverable.
	 */
	soloDueno?: boolean;
};

export const NAV: readonly NavItem[] = [
	// Home is the KPI dashboard and lives at /panel itself. Gated on `cita:read` because that is
	// exactly the set of roles with at least one KPI block today — a role with none is redirected
	// by the page anyway, so the worst a drift here does is show a link that bounces.
	{ href: "/panel", label: "Inicio", icon: "layout-dashboard", permission: "cita:read" },
	{ href: "/panel/dashboard", label: "Dashboard gerencial", icon: "chart-column", permission: "dashboard:ver" },
	{ href: "/panel/agenda", label: "Agenda", icon: "calendar-days", permission: "cita:read" },
	{ href: "/panel/citas", label: "Citas", icon: "list", permission: "cita:read" },
	{ href: "/panel/chat", label: "Chat", icon: "message-circle", permission: "canal:chat" },
	// The mechanic's whole app. First for them because it is the ONLY entry they hold — everyone
	// else already has the full floor above it, so its position changes nothing.
	{
		href: "/panel/taller",
		label: "Mi trabajo",
		icon: "wrench",
		permission: "nota:asignadas",
		ocultarSi: "nota:read",
	},
	{ href: "/panel/notas", label: "Notas de servicio", icon: "clipboard-list", permission: "nota:read" },

	// Everything below is a lower-frequency screen, grouped into an accordion per cluster.
	// Consecutive `grupo` entries collapse together in the sidebar — order here is the grouping.

	// Named for what it answers, not for one of the two things it lists: quotes, invoices, what was
	// collected and what is still owed, over a period.
	{ href: "/panel/cotizaciones", label: "Dinero", icon: "receipt-text", permission: "cotizacion:read", grupo: "Finanzas" },
	{
		href: "/panel/cuentas-bancarias",
		label: "Cuentas bancarias",
		icon: "landmark",
		permission: "cuenta_bancaria:manage",
		grupo: "Finanzas",
	},

	{ href: "/panel/inventario", label: "Inventario", icon: "package", permission: "producto:read", grupo: "Suministros" },
	{ href: "/panel/proveedores", label: "Proveedores", icon: "truck", permission: "proveedor:read", grupo: "Suministros" },
	{ href: "/panel/talleres", label: "Talleres aliados", icon: "wrench", permission: "taller:read", grupo: "Suministros" },

	{ href: "/panel/clientes", label: "Clientes", icon: "contact", permission: "cliente:read", grupo: "Clientes" },
	{ href: "/panel/unidades", label: "Unidades", icon: "car", permission: "unidad:read", grupo: "Clientes" },
	{
		href: "/panel/recordatorios",
		label: "Recordatorios",
		icon: "bell",
		permission: "recordatorio:manage",
		grupo: "Clientes",
	},

	{ href: "/panel/usuarios", label: "Usuarios", icon: "users", permission: "user:list", grupo: "Administración" },
	{ href: "/panel/auditoria", label: "Auditoría", icon: "scroll-text", permission: "audit:read", grupo: "Administración" },
	{ href: "/panel/ia-uso", label: "Uso de IA", icon: "sparkles", permission: "ia:uso_read", grupo: "Administración" },
	{
		href: "/panel/facturacion-app",
		label: "Facturación de la app",
		icon: "credit-card",
		permission: "pago_app:upload",
		grupo: "Administración",
	},
	{
		href: "/panel/empresa",
		label: "Datos de la empresa",
		icon: "contact",
		permission: "empresa:manage",
		grupo: "Administración",
	},
	{ href: "/panel/permisos", label: "Permisos", icon: "shield-check", permission: "permisos:manage", grupo: "Administración" },
	// Last, and only for us: the PAC's credentials and what stamping costs. An Admin at the shop
	// holds `ajustes:read` in the registry and still never sees this row — see `soloDueno`.
	{
		href: "/panel/ajustes",
		label: "Ajustes del sistema",
		icon: "settings",
		permission: "ajustes:read",
		soloDueno: true,
		grupo: "Administración",
	},

	// Flat, not grouped: help should stay one click away, not buried behind an accordion. Gated
	// on `nota:asignadas` — the one permission all four roles already hold (same key "Mi trabajo"
	// uses), so every role sees it without inventing an "everyone" permission that doesn't exist
	// in the registry.
	{ href: "/panel/manual", label: "Manual de uso", icon: "circle-help", permission: "nota:asignadas" },
];
