/**
 * Appointment vocabulary: estados, tipos and the two franjas a customer can ask for.
 *
 * Every key here is mirrored by a CHECK constraint on `cita` — adding one means a migration
 * that widens the constraint in the same change (Rule 2).
 *
 * Safe to import from the browser: data only.
 */

/** Badge tones, matching src/lib/components/Badge.svelte. */
type Tone = "neutral" | "ok" | "warn" | "danger" | "brand";

export const CITA_ESTADOS = {
	solicitada: {
		label: "Solicitada",
		tone: "warn",
		descripcion: "Llegó del formulario público y todavía no tiene hora asignada",
	},
	confirmada: { label: "Confirmada", tone: "brand", descripcion: "Con hora asignada" },
	en_proceso: { label: "En proceso", tone: "brand", descripcion: "La unidad ya está siendo atendida" },
	completada: { label: "Completada", tone: "ok", descripcion: "Terminada" },
	cancelada: { label: "Cancelada", tone: "danger", descripcion: "Cancelada por el taller" },
	no_asistio: { label: "No asistió", tone: "neutral", descripcion: "El cliente no llegó" },
} as const satisfies Record<string, { label: string; tone: Tone; descripcion: string }>;

export type CitaEstado = keyof typeof CITA_ESTADOS;
export const CITA_ESTADO_KEYS = Object.keys(CITA_ESTADOS) as CitaEstado[];
export const isCitaEstado = (v: unknown): v is CitaEstado => typeof v === "string" && v in CITA_ESTADOS;
export const citaEstadoLabel = (v: string) => (isCitaEstado(v) ? CITA_ESTADOS[v].label : v);
export const citaEstadoTone = (v: string): Tone => (isCitaEstado(v) ? CITA_ESTADOS[v].tone : "neutral");

/**
 * The state machine, as data. A move that is not listed is a 409 — no scattered `if`s, and the
 * check-agenda self-check can assert there is no way back out of a terminal estado.
 *
 * `cancelada` is reachable from anywhere live, but only through `cancelarCita` (cita:cancel).
 * `avanzarCita` refuses it on purpose, so cancelling is never something an Operador does by
 * "advancing" one more step.
 */
export const TRANSICIONES = {
	// A request has no hour yet, so the only way out is to give it one (confirmar) or drop it.
	// "No asistió" is meaningless before an appointment was ever granted — there was nothing to
	// show up to — and the database refuses it outright: see REQUIEREN_HORA below.
	solicitada: ["confirmada", "cancelada"],
	confirmada: ["en_proceso", "completada", "cancelada", "no_asistio"],
	en_proceso: ["completada", "cancelada"],
	completada: [],
	cancelada: [],
	no_asistio: [],
} as const satisfies Record<CitaEstado, readonly CitaEstado[]>;

/**
 * Estados that cannot exist without `inicio`.
 *
 * This MIRRORS the `cita_inicio_requerido_check` constraint in the citas migration — the database
 * is the real guard, this is so the app refuses with a Spanish message instead of letting a
 * constraint violation surface as a 500. Change one, change the other.
 */
export const REQUIEREN_HORA = CITA_ESTADO_KEYS.filter(
	(e) => e !== "solicitada" && e !== "cancelada",
);

export const requiereHora = (estado: string): boolean =>
	(REQUIEREN_HORA as readonly string[]).includes(estado);

export function puedeTransicionar(desde: string, hasta: string): boolean {
	if (!isCitaEstado(desde) || !isCitaEstado(hasta)) return false;
	return (TRANSICIONES[desde] as readonly string[]).includes(hasta);
}

/**
 * Recolección is listed FIRST and is the default: going to collect the vehicle is a core part of
 * what Estación 360 sells, not an afterthought. Key order drives the pickers, so leave it.
 */
export const CITA_TIPOS = {
	recoleccion: { label: "Recolección", descripcion: "Nosotros vamos por tu unidad a domicilio" },
	en_sitio: { label: "En el taller", descripcion: "Tú traes la unidad al taller" },
} as const satisfies Record<string, { label: string; descripcion: string }>;

export type CitaTipo = keyof typeof CITA_TIPOS;
export const CITA_TIPO_KEYS = Object.keys(CITA_TIPOS) as CitaTipo[];
export const CITA_TIPO_DEFAULT: CitaTipo = "recoleccion";
export const isCitaTipo = (v: unknown): v is CitaTipo => typeof v === "string" && v in CITA_TIPOS;
export const citaTipoLabel = (v: string) => (isCitaTipo(v) ? CITA_TIPOS[v].label : v);

/**
 * What the customer picks instead of an exact hour. `desde`/`hasta` are the shop hours the
 * franja covers — used to default the slot when staff confirm, and to label the option.
 */
export const FRANJAS = {
	manana: { label: "Mañana", desde: "08:00", hasta: "13:00" },
	tarde: { label: "Tarde", desde: "13:00", hasta: "18:00" },
} as const satisfies Record<string, { label: string; desde: string; hasta: string }>;

export type Franja = keyof typeof FRANJAS;
export const FRANJA_KEYS = Object.keys(FRANJAS) as Franja[];
export const isFranja = (v: unknown): v is Franja => typeof v === "string" && v in FRANJAS;
export const franjaLabel = (v: string | null) =>
	v && isFranja(v) ? `${FRANJAS[v].label} (${FRANJAS[v].desde}–${FRANJAS[v].hasta})` : "Sin franja";

/** Default duration of an appointment when nobody says otherwise. */
export const DURACION_MINUTOS = 60;
