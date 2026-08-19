/**
 * Calendar math. Pure and dependency-free — see scripts/check-agenda.ts.
 *
 * Everything here works in the SHOP's timezone, never the viewer's. A Gerente on a laptop set to
 * CDMX has to see the same grid as the counter in Hermosillo, or two people reading the same
 * screen disagree about what time a car arrives.
 *
 * Safe to import from the browser: data only.
 */

// ponytail: Sonora has been on UTC-7 with no DST since 1998, so a fixed offset is exact and
// needs no tz database at all. If Sonora ever adopts DST again this is the one place to change:
// swap `OFFSET` string math for Intl/Temporal zoned arithmetic.
export const ZONA = "America/Hermosillo";
export const OFFSET = "-07:00";

/** Shop hours drawn on the grid. */
export const HORA_ABRE = 7;
export const HORA_CIERRA = 19;

/** An instant, from a shop-local calendar date and wall-clock time. */
export const enZona = (fecha: string, hora = "00:00") => new Date(`${fecha}T${hora}:00${OFFSET}`);

/** The shop-local calendar date of an instant, as `YYYY-MM-DD`. */
export function fechaEnZona(d: Date): string {
	// `en-CA` formats as YYYY-MM-DD, which is exactly the shape we store and compare on.
	return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);
}

/** Shop-local `HH:MM` of an instant. */
export function horaEnZona(d: Date): string {
	return new Intl.DateTimeFormat("es-MX", {
		timeZone: ZONA,
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(d);
}

/**
 * An instant as the `YYYY-MM-DDTHH:MM` an `<input type="datetime-local">` wants.
 *
 * The input has no timezone, so what goes in it is shop wall-clock time — the same reading
 * `leerInstante` pins back to `OFFSET` on the way in. Never the viewer's clock.
 */
export function paraDatetimeLocal(valor: string | Date | null): string {
	if (!valor) return "";
	const d = typeof valor === "string" ? new Date(valor) : valor;
	if (Number.isNaN(d.getTime())) return "";
	// `hourCycle: "h23"` and not `hour12: false`: the latter renders midnight as `24:00` in some
	// ICU builds, and the input silently refuses it.
	const hora = new Intl.DateTimeFormat("en-GB", {
		timeZone: ZONA,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(d);
	return `${fechaEnZona(d)}T${hora}`;
}

export function horaCorta(d: Date): string {
	return new Intl.DateTimeFormat("es-MX", {
		timeZone: ZONA,
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).format(d);
}

export function fechaLarga(fecha: string): string {
	return new Intl.DateTimeFormat("es-MX", {
		timeZone: ZONA,
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(enZona(fecha, "12:00"));
}

/** `YYYY-MM-DD` or null. Rejects "2026-02-31" — Date would silently roll it to March. */
export function parseFecha(value: unknown): string | null {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	return fechaEnZona(enZona(value, "12:00")) === value ? value : null;
}

/** Today in the shop's timezone. */
export const hoy = () => fechaEnZona(new Date());

/** Shift a calendar date by whole days. Midday anchor keeps the arithmetic away from any edge. */
export function sumarDias(fecha: string, dias: number): string {
	const d = enZona(fecha, "12:00");
	d.setUTCDate(d.getUTCDate() + dias);
	return fechaEnZona(d);
}

/**
 * Whole shop-local days from `desde` to `hasta`. Negative when `hasta` already passed — this is
 * the one place "vence en 3 días" vs. "vencida hace 3 días" gets computed, so every screen that
 * shows a due date reads the same number.
 */
export function diasEntre(desde: string, hasta: string): number {
	return Math.round((enZona(hasta, "12:00").getTime() - enZona(desde, "12:00").getTime()) / 86_400_000);
}

/**
 * Seven days STARTING at `fecha` — a rolling week, not a calendar one.
 *
 * The default anchor is today, so today is always the first column. A counter looking at the
 * agenda cares about the next seven days; on a Friday, a Monday-aligned week would spend five
 * of its seven columns on days that already happened.
 */
export function semanaDe(fecha: string): string[] {
	return Array.from({ length: 7 }, (_, i) => sumarDias(fecha, i));
}

/**
 * Preset ranges for the stats screens. `dias: null` means "since the account was created".
 * Lives here rather than in the route because SvelteKit only allows specific exports from a
 * `+page.server.ts`, and the page needs the labels too.
 */
export const PERIODOS = [
	{ value: "7", label: "7 días", dias: 7 },
	{ value: "30", label: "30 días", dias: 30 },
	{ value: "90", label: "90 días", dias: 90 },
	{ value: "365", label: "1 año", dias: 365 },
	{ value: "todo", label: "Todo", dias: null },
] as const satisfies readonly { value: string; label: string; dias: number | null }[];

export const PERIODO_DEFAULT = "30";

export const periodoDe = (value: string | null) =>
	PERIODOS.find((p) => p.value === value) ?? PERIODOS.find((p) => p.value === PERIODO_DEFAULT)!;

/**
 * The four ways to read the same week's worth of work.
 *
 * `dia` and `semana` draw the time grid; `mes` is the overview you plan against; `agenda` is the
 * flat chronological list — the one that survives on a phone, and the only one that shows a
 * request with no hour next to the appointments it is competing with.
 *
 * Order is the order of the buttons, narrowest first, because that is how the counter steps out.
 */
export const VISTAS = {
	dia: { label: "Día", dias: 1 },
	semana: { label: "Semana", dias: 7 },
	mes: { label: "Mes", dias: 0 },
	agenda: { label: "Agenda", dias: 30 },
} as const satisfies Record<string, { label: string; dias: number }>;

export type Vista = keyof typeof VISTAS;
export const VISTA_KEYS = Object.keys(VISTAS) as Vista[];
export const isVista = (v: unknown): v is Vista => typeof v === "string" && Object.hasOwn(VISTAS, v);
export const vistaLabel = (v: string) => (isVista(v) ? VISTAS[v].label : v);

/** First day of `fecha`'s calendar month. */
export const inicioDeMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;

/** Last day of `fecha`'s calendar month. Day 0 of the next month IS the last of this one. */
export function finDeMes(fecha: string): string {
	const d = enZona(inicioDeMes(fecha), "12:00");
	d.setUTCMonth(d.getUTCMonth() + 1);
	d.setUTCDate(0);
	return fechaEnZona(d);
}

/** Shift by whole calendar months, clamped so 31-Jan + 1 is the 28th, not the 3rd of March. */
export function sumarMeses(fecha: string, meses: number): string {
	const d = enZona(inicioDeMes(fecha), "12:00");
	d.setUTCMonth(d.getUTCMonth() + meses);
	const primero = fechaEnZona(d);
	const dia = Number(fecha.slice(8, 10));
	const ultimo = Number(finDeMes(primero).slice(8, 10));
	return `${primero.slice(0, 8)}${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/**
 * The month grid: whole weeks, Monday-aligned, covering the month and the days that pad it out.
 *
 * A month view IS calendar-aligned, unlike the rolling week — you read it against "the 15th falls
 * on a Tuesday", which only works if the columns are weekdays. Always six rows so the grid does
 * not jump height between months.
 */
export function celdasDeMes(fecha: string): string[] {
	const primero = inicioDeMes(fecha);
	// getUTCDay: 0 = Sunday. Monday-first means Sunday sits at the end.
	const diaSemana = (enZona(primero, "12:00").getUTCDay() + 6) % 7;
	const arranque = sumarDias(primero, -diaSemana);
	return Array.from({ length: 42 }, (_, i) => sumarDias(arranque, i));
}

/** The half-open instant range a view covers, for one `WHERE fecha BETWEEN` per screen. */
export function rangoVista(vista: Vista, fecha: string): { desde: string; hasta: string } {
	if (vista === "dia") return { desde: fecha, hasta: fecha };
	if (vista === "mes") {
		const celdas = celdasDeMes(fecha);
		return { desde: celdas[0], hasta: celdas[celdas.length - 1] };
	}
	if (vista === "agenda") return { desde: fecha, hasta: sumarDias(fecha, VISTAS.agenda.dias - 1) };
	const dias = semanaDe(fecha);
	return { desde: dias[0], hasta: dias[6] };
}

/**
 * Where the arrows go from here.
 *
 * A month steps by months and everything else steps by its own span, so "next" always means "the
 * next screenful" rather than a fixed number of days — stepping a month view by 7 would show the
 * same month four times.
 */
export function pasoDeVista(vista: Vista, fecha: string, direccion: 1 | -1): string {
	if (vista === "mes") return sumarMeses(fecha, direccion);
	return sumarDias(fecha, VISTAS[vista].dias * direccion);
}

export type Ubicable = { inicio: Date; fin: Date };

/**
 * Lay overlapping appointments out side by side.
 *
 * Sweep in start order, keeping a cluster of everything that overlaps something already in it.
 * Each member takes the lowest free column; the cluster's width is the most columns it ever
 * needed, so every member of one cluster gets the same `cols` and the row lines up.
 *
 * Touching edges do NOT overlap: an appointment ending at 10:00 and one starting at 10:00 are
 * back to back, and drawing them half-width each would waste the column for no reason.
 */
export function acomodar<T extends Ubicable>(citas: T[]): (T & { col: number; cols: number })[] {
	const orden = [...citas].sort(
		(a, b) => a.inicio.getTime() - b.inicio.getTime() || a.fin.getTime() - b.fin.getTime(),
	);

	const salida: (T & { col: number; cols: number })[] = [];
	let grupo: (T & { col: number; cols: number })[] = [];
	let finDelGrupo = -Infinity;

	const cerrar = () => {
		const ancho = grupo.reduce((max, c) => Math.max(max, c.col + 1), 1);
		for (const c of grupo) c.cols = ancho;
		salida.push(...grupo);
		grupo = [];
		finDelGrupo = -Infinity;
	};

	for (const cita of orden) {
		// Nothing in the cluster still runs at this start time -> the cluster is over.
		if (cita.inicio.getTime() >= finDelGrupo) cerrar();

		const ocupadas = new Set(grupo.filter((c) => c.fin.getTime() > cita.inicio.getTime()).map((c) => c.col));
		let col = 0;
		while (ocupadas.has(col)) col++;

		grupo.push({ ...cita, col, cols: 1 });
		finDelGrupo = Math.max(finDelGrupo, cita.fin.getTime());
	}
	cerrar();

	return salida;
}

/** Vertical placement inside a day column, as percentages of the shop's open hours. */
export function posicion(inicio: Date, fin: Date): { top: number; alto: number } {
	const minutos = (d: Date) => {
		const [h, m] = horaEnZona(d).split(":").map(Number);
		return h * 60 + m;
	};
	const abre = HORA_ABRE * 60;
	const total = (HORA_CIERRA - HORA_ABRE) * 60;
	const desde = Math.max(0, minutos(inicio) - abre);
	const hasta = Math.min(total, minutos(fin) - abre);
	return {
		top: (desde / total) * 100,
		// Floor the height so a 15-minute appointment is still readable.
		alto: Math.max(4, ((hasta - desde) / total) * 100),
	};
}
