/**
 * App-wide settings: the catalogue, as data.
 *
 * Same shape as `audit-actions.ts` and `NOTIFICACION_EVENTOS` — adding a setting means adding its
 * key here in the same change, and a key that is not here **cannot be written**. Deny by default,
 * for the same reason permissions are: a settings table that accepts any key is a settings table
 * where a typo silently becomes a second source of truth nobody reads.
 *
 * Safe to import from the browser: data and pure functions only. **The values never come with
 * it** — a `secreto` setting is served as a hint (`••••1234`) and nothing else.
 */

export type TipoAjuste = "texto" | "secreto" | "opcion";

export type DefinicionAjuste = {
	label: string;
	descripcion: string;
	tipo: TipoAjuste;
	grupo: GrupoAjuste;
	/** `opcion` only. First entry is the default. */
	opciones?: readonly { valor: string; label: string }[];
	/** Shown under the field when it is empty — where the value comes from. */
	ayuda?: string;
};

export const GRUPOS = {
	facturacion: {
		label: "Facturación (factura.com)",
		descripcion: "El PAC que timbra los CFDI. Sin estas llaves, timbrar responde 503 en vez de fallar callado.",
	},
} as const satisfies Record<string, { label: string; descripcion: string }>;

export type GrupoAjuste = keyof typeof GRUPOS;
export const GRUPO_KEYS = Object.keys(GRUPOS) as GrupoAjuste[];

/**
 * Every setting the app knows about.
 *
 * Keys are `<grupo>.<nombre>`, so the screen groups them without a second registry to keep in
 * step. Stripe and the AI providers land here as new groups when they land — that is the whole
 * reason this is a catalogue and not four columns on a `configuracion` row.
 */
export const AJUSTES = {
	"facturacion.entorno": {
		label: "Entorno",
		descripcion: "Sandbox no genera CFDI reales y no gasta timbres. Producción sí, y no se deshace.",
		tipo: "opcion",
		grupo: "facturacion",
		opciones: [
			{ valor: "sandbox", label: "Sandbox (pruebas)" },
			{ valor: "produccion", label: "Producción (timbra de verdad)" },
		],
	},
	"facturacion.apiKey": {
		label: "F-Api-Key",
		descripcion: "La API key de la cuenta.",
		tipo: "secreto",
		grupo: "facturacion",
		ayuda: "En sandbox sale del panel de sandbox.factura.com, no del de producción.",
	},
	"facturacion.secretKey": {
		label: "F-Secret-Key",
		descripcion: "La secret key de la cuenta. Nunca se vuelve a mostrar después de guardarla.",
		tipo: "secreto",
		grupo: "facturacion",
		ayuda: "Del mismo panel que la API key, y del mismo entorno.",
	},
	"facturacion.serie": {
		label: "Serie",
		descripcion: "El id numérico de la serie con la que se timbra.",
		tipo: "texto",
		grupo: "facturacion",
		ayuda: "Es un número (el id), no la letra de la serie. Sale de Configuración → Series.",
	},
} as const satisfies Record<string, DefinicionAjuste>;

export type ClaveAjuste = keyof typeof AJUSTES;
export const AJUSTE_KEYS = Object.keys(AJUSTES) as ClaveAjuste[];

/** Deny by default: an unregistered key is not a setting, whatever a request body calls it. */
export const esClaveDeAjuste = (v: unknown): v is ClaveAjuste => typeof v === "string" && Object.hasOwn(AJUSTES, v);

export const esSecreto = (clave: string): boolean => esClaveDeAjuste(clave) && AJUSTES[clave].tipo === "secreto";

/** The default for an `opcion`: its first option. Everything else defaults to empty. */
export function valorPorDefecto(clave: ClaveAjuste): string {
	const def = AJUSTES[clave] as DefinicionAjuste;
	return def.tipo === "opcion" ? (def.opciones?.[0]?.valor ?? "") : "";
}

export const ajustesDelGrupo = (grupo: GrupoAjuste): ClaveAjuste[] =>
	AJUSTE_KEYS.filter((k) => (AJUSTES[k] as DefinicionAjuste).grupo === grupo);

/**
 * What a stored secret looks like on screen: the last four characters and nothing else.
 *
 * Enough to answer "is this the key I think it is" without being enough to use. Short values are
 * masked whole rather than half-revealed — four of six characters is not a hint, it is the key.
 */
export function pistaDeSecreto(valor: string): string {
	const limpio = valor.trim();
	if (limpio.length === 0) return "";
	if (limpio.length < 12) return "••••••••";
	return `••••${limpio.slice(-4)}`;
}

/**
 * Is this person the system owner — us, the people who run the software — rather than whoever
 * happens to hold the Admin role at the shop?
 *
 * `ajustes:*` is Admin in the registry AND narrowed by this list, because the two answer different
 * questions. The shop will have its own Admin one day; that account manages the shop. It does not
 * get the credentials that stamp CFDIs in our name, or the bill for the timbres.
 *
 * Pure and case-insensitive so `check-roles.ts` can pin it. **An empty list denies everybody** —
 * a misconfigured deployment must not open the settings screen to every Admin, which is exactly
 * what a "no list means no restriction" default would do.
 */
export function esDuenoDelSistema(email: string | null | undefined, lista: string | null | undefined): boolean {
	if (!email) return false;
	const permitidos = (lista ?? "")
		.split(",")
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
	return permitidos.includes(email.trim().toLowerCase());
}
