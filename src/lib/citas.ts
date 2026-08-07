/**
 * Appointment vocabulary: estados, tipos and the two franjas a customer can ask for.
 *
 * Every key here is mirrored by a CHECK constraint on `cita` — adding one means a migration
 * that widens the constraint in the same change (Rule 2).
 *
 * Safe to import from the browser: data only.
 */

import { paraDatetimeLocal } from "./agenda";

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
export const isCitaEstado = (v: unknown): v is CitaEstado => typeof v === "string" && Object.hasOwn(CITA_ESTADOS, v);
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
export const REQUIEREN_HORA = CITA_ESTADO_KEYS.filter((e) => e !== "solicitada" && e !== "cancelada");

export const requiereHora = (estado: string): boolean => (REQUIEREN_HORA as readonly string[]).includes(estado);

export function puedeTransicionar(desde: string, hasta: string): boolean {
	if (!isCitaEstado(desde) || !isCitaEstado(hasta)) return false;
	return (TRANSICIONES[desde] as readonly string[]).includes(hasta);
}

/**
 * Which board column a card may be dropped into. It decides which drops are OFFERED; the server
 * still decides which ones happen, so `avanzarCita` / `confirmarCita` / `cancelarCita` re-check
 * every one of these. Keep the two in step — `check-agenda.ts` pins this half.
 *
 * A drop starts a flow, it does not write. That is why an unlinked cita may still be dropped on
 * Confirmada: vincular is a STEP OF confirming, not a precondition somebody has to go do
 * elsewhere first — see `pasoParaMover`.
 */
export function puedeMoverCita(
	cita: { estado: string; inicio: string | null; asignadoId: string | null },
	destino: string,
	permisos: { avanzar: boolean; cancelar: boolean; actualizar: boolean; actorId: string },
): boolean {
	if (!puedeTransicionar(cita.estado, destino)) return false;

	// Cancelling is its own permission and its own reason — never just "one more step forward".
	if (destino === "cancelada") return permisos.cancelar;

	// Granting the hour is `confirmarCita`, which is cita:update. Checked before the `requiereHora`
	// rule below, because confirming is what GRANTS the hour.
	if (destino === "confirmada") return permisos.actualizar;

	if (!permisos.avanzar) return false;
	// An estado that cannot exist without an hour is unreachable until one was granted.
	if (requiereHora(destino) && !cita.inicio) return false;
	// The ownership rule: an Operador advances only what is assigned to them.
	return permisos.actualizar || cita.asignadoId === permisos.actorId;
}

/**
 * What the board has to ask for before a dropped card can actually move.
 *
 * `confirmarCita` refuses (409) until the appointment points at a real cliente AND a real unidad,
 * so dropping an unlinked request on Confirmada asks for those FIRST and only then for the hour.
 * The alternative — refusing the drop and telling somebody to go open the cita — is the counter
 * being sent away to do by hand exactly what the drawer already knows how to do.
 */
export type PasoMover = "vincular" | "hora" | "motivo" | "confirmar";

export function pasoParaMover(cita: { vinculada: boolean }, destino: string): PasoMover {
	if (destino === "cancelada") return "motivo";
	if (destino !== "confirmada") return "confirmar";
	return cita.vinculada ? "hora" : "vincular";
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
export const isCitaTipo = (v: unknown): v is CitaTipo => typeof v === "string" && Object.hasOwn(CITA_TIPOS, v);
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
export const isFranja = (v: unknown): v is Franja => typeof v === "string" && Object.hasOwn(FRANJAS, v);
export const franjaLabel = (v: string | null) =>
	v && isFranja(v) ? `${FRANJAS[v].label} (${FRANJAS[v].desde}–${FRANJAS[v].hasta})` : "Sin franja";

/**
 * What hour the confirm form starts on: the one already granted, or the start of the franja the
 * customer asked for.
 *
 * Shared by the detail screen and the board drawer — a different default in each is how the same
 * request gets booked at two different hours depending on which screen somebody happened to use.
 */
export const horaSugerida = (c: { inicio: string | null; fecha: string; franja: string | null }): string =>
	c.inicio ? paraDatetimeLocal(c.inicio) : `${c.fecha}T${isFranja(c.franja) ? FRANJAS[c.franja].desde : "09:00"}`;

/** Default duration of an appointment when nobody says otherwise. */
export const DURACION_MINUTOS = 60;

/**
 * Why an appointment counts as overdue. Two different failures, and they cost different things:
 *
 * - `sin_atender` — somebody asked for a date, that date came and went, and nobody ever confirmed
 *   it. This is a customer who raised their hand and got silence: the most expensive kind of
 *   miss, because the sale was already half made.
 * - `sin_procesar` — a confirmed slot whose hour passed with the appointment still sitting in
 *   `confirmada`. Either the vehicle never showed and nobody recorded it, or it did and nobody
 *   moved the appointment along. Both need a phone call.
 *
 * Neither is a state the appointment is IN — they are derived from the clock, so an appointment
 * stops being overdue the moment somebody acts on it. Nothing to migrate, nothing to sweep.
 */
export const MOTIVOS_VENCIDA = {
	sin_atender: {
		label: "Solicitud sin atender",
		descripcion: "Pasó el día que pidió el cliente y nunca se confirmó",
		tone: "danger",
	},
	sin_procesar: {
		label: "Cita sin procesar",
		descripcion: "Pasó su hora y sigue en confirmada: nadie la recibió ni la cerró",
		tone: "warn",
	},
} as const satisfies Record<string, { label: string; descripcion: string; tone: Tone }>;

export type MotivoVencida = keyof typeof MOTIVOS_VENCIDA;
export const MOTIVO_VENCIDA_KEYS = Object.keys(MOTIVOS_VENCIDA) as MotivoVencida[];
export const motivoVencidaLabel = (v: string) =>
	Object.hasOwn(MOTIVOS_VENCIDA, v) ? MOTIVOS_VENCIDA[v as MotivoVencida].label : v;

/**
 * Grace after the slot ends before a confirmed appointment reads as unprocessed. A car running
 * twenty minutes late is not a failure; still open two hours later is.
 */
export const GRACIA_MINUTOS = 120;

/**
 * Which overdue bucket an appointment falls in, if any.
 *
 * Pure and clock-driven on purpose: nothing is stored, so there is no sweeper job to run and no
 * stale flag to clean up — the moment somebody acts on the appointment it stops being overdue.
 * `hoyEnZona` is passed in rather than computed here so this stays free of the timezone module
 * and trivially testable.
 */
export function motivoVencida(
	c: { estado: string; fecha: string; inicio: string | null },
	ahora: Date,
	hoyEnZona: string,
): MotivoVencida | null {
	if (c.estado === "solicitada") return c.fecha < hoyEnZona ? "sin_atender" : null;
	if (c.estado === "confirmada" && c.inicio) {
		return new Date(c.inicio).getTime() < ahora.getTime() - GRACIA_MINUTOS * 60_000 ? "sin_procesar" : null;
	}
	return null;
}
