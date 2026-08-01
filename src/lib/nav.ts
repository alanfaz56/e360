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
	icon: "users" | "contact" | "scroll-text";
	permission: Permission;
};

export const NAV: readonly NavItem[] = [
	{ href: "/panel/usuarios", label: "Usuarios", icon: "users", permission: "user:list" },
	{ href: "/panel/clientes", label: "Clientes", icon: "contact", permission: "cliente:read" },
	{ href: "/panel/auditoria", label: "Auditoría", icon: "scroll-text", permission: "audit:read" },
];
