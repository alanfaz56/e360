/**
 * Partner workshop registry: browser-safe labels and tones.
 *
 * Certification is a status on the one `taller` row, not a separate applications table. Approving
 * is then a status change instead of a copy between two tables that can quietly disagree about
 * who is certified — and `transferirNota` has one condition to check, not a join.
 */

/** Matches the `tone` prop on Badge, so a status renders the same everywhere. */
type Tone = "neutral" | "ok" | "warn" | "brand" | "danger";

export const TALLER_ESTADOS = {
	solicitado: {
		label: "Por revisar",
		descripcion: "Se registró desde la página pública y espera revisión.",
		tone: "warn",
	},
	aprobado: {
		label: "Certificado",
		descripcion: "Puede recibir unidades de Estación 360.",
		tone: "ok",
	},
	rechazado: {
		label: "Rechazado",
		descripcion: "No cumplió los requisitos. El motivo queda registrado.",
		tone: "danger",
	},
} as const satisfies Record<string, { label: string; descripcion: string; tone: Tone }>;

export const tallerEstadoTono = (estado: string): Tone =>
	(TALLER_ESTADOS as Record<string, { tone: Tone }>)[estado]?.tone ?? "neutral";

export type TallerEstado = keyof typeof TALLER_ESTADOS;

export const TALLER_ESTADO_KEYS = Object.keys(TALLER_ESTADOS) as TallerEstado[];

export const isTallerEstado = (v: unknown): v is TallerEstado =>
	typeof v === "string" && v in TALLER_ESTADOS;

/** The only estado that may receive a vehicle. Enforced in `transferirNota`. */
export const TALLER_PUEDE_RECIBIR: TallerEstado = "aprobado";

export const tallerEstadoLabel = (e: string): string =>
	(TALLER_ESTADOS as Record<string, { label: string }>)[e]?.label ?? e;

/**
 * What the shop promises a certified partner. Shown on the public landing page — and kept here
 * rather than inline in the markup so the same list can be repeated on the application form and
 * in the approval email later without drifting.
 */
export const BENEFICIOS_TALLER = [
	{
		titulo: "Trabajo constante",
		texto: "Estación 360 recibe las unidades, diagnostica y te manda el trabajo ya autorizado por el cliente.",
	},
	{
		titulo: "Tú te dedicas a reparar",
		texto: "Nosotros vemos la cotización, la cobranza y la entrega. Tú no persigues a nadie por un pago.",
	},
	{
		titulo: "Pago por trabajo entregado",
		texto: "Cada unidad pasa por control de calidad al regresar. Aprobada es trabajo cerrado.",
	},
	{
		titulo: "Una relación, no una plataforma",
		texto: "Somos un taller en Hermosillo trabajando con talleres de Hermosillo. Sin comisiones por aparecer.",
	},
] as const;

/** What a shop has to be able to say yes to. Also the checklist the Gerente reviews against. */
export const REQUISITOS_TALLER = [
	"Taller establecido con domicilio fijo en Hermosillo o alrededores",
	"Al menos una especialidad clara (mecánica general, hojalatería, transmisiones, eléctrico…)",
	"Alguien responsable con quien podamos hablar por teléfono en horario de taller",
	"Disposición a que cada unidad pase por control de calidad al entregarla",
] as const;
