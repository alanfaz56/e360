/**
 * Nota de servicio vocabulary: estados, the intake checklist and the fuel gauge.
 *
 * A nota is what exists once the vehicle is physically at the shop. It is opened from a cita on
 * arrival, carries the intake inspection, and is the thing that gets routed to a partner taller.
 *
 * Every key here is mirrored by a CHECK constraint — adding one means a migration that widens the
 * constraint in the same change (Rule 2). Safe to import from the browser: data only.
 */

type Tone = "neutral" | "ok" | "warn" | "danger" | "brand";

export const NOTA_ESTADOS = {
	recibida: {
		label: "Recibida",
		tone: "warn",
		descripcion: "La unidad está en el taller y se levantó el inventario de entrada",
	},
	en_diagnostico: { label: "En diagnóstico", tone: "brand", descripcion: "Revisando qué tiene" },
	en_taller: {
		label: "En taller externo",
		tone: "brand",
		descripcion: "El trabajo se mandó a un taller aliado",
	},
	lista: { label: "Lista para entrega", tone: "ok", descripcion: "Terminada, esperando al cliente" },
	entregada: { label: "Entregada", tone: "ok", descripcion: "El cliente ya se llevó la unidad" },
	cancelada: { label: "Cancelada", tone: "danger", descripcion: "No se realizó el servicio" },
} as const satisfies Record<string, { label: string; tone: Tone; descripcion: string }>;

/**
 * What the CUSTOMER is told, per estado.
 *
 * The partner workshop is never part of this. Estación 360 sources the job out and is the one the
 * customer holds responsible; telling them the unit is at "Hojalatería El Sahuaro" invites them to
 * go straight there next time, cutting out the shop that found the work, priced it and warranties
 * it. So `en_taller` reads exactly like ordinary progress.
 */
export const NOTA_ESTADO_CLIENTE: Record<string, string> = {
	recibida: "Recibida en el taller",
	en_diagnostico: "En diagnóstico",
	en_taller: "En proceso de reparación",
	lista: "Lista para entrega",
	entregada: "Entregada",
	cancelada: "Cancelada",
};

export const notaEstadoClienteLabel = (v: string) => NOTA_ESTADO_CLIENTE[v] ?? "En proceso";

export type NotaEstado = keyof typeof NOTA_ESTADOS;
export const NOTA_ESTADO_KEYS = Object.keys(NOTA_ESTADOS) as NotaEstado[];
export const isNotaEstado = (v: unknown): v is NotaEstado => typeof v === "string" && Object.hasOwn(NOTA_ESTADOS, v);
export const notaEstadoLabel = (v: string) => (isNotaEstado(v) ? NOTA_ESTADOS[v].label : v);
export const notaEstadoTone = (v: string): Tone => (isNotaEstado(v) ? NOTA_ESTADOS[v].tone : "neutral");

/**
 * The state machine, as data.
 *
 * `en_taller` can go back to `en_diagnostico`: a partner shop returning the unit without doing the
 * work is a real thing, and it is not a failure state. `entregada` and `cancelada` are terminal —
 * a vehicle that already left cannot quietly become "in repair" again.
 */
export const NOTA_TRANSICIONES = {
	recibida: ["en_diagnostico", "en_taller", "lista", "cancelada"],
	en_diagnostico: ["en_taller", "lista", "cancelada"],
	en_taller: ["en_diagnostico", "lista", "cancelada"],
	lista: ["entregada", "en_diagnostico", "cancelada"],
	entregada: [],
	cancelada: [],
} as const satisfies Record<NotaEstado, readonly NotaEstado[]>;

export function puedeTransicionarNota(desde: string, hasta: string): boolean {
	if (!isNotaEstado(desde) || !isNotaEstado(hasta)) return false;
	return (NOTA_TRANSICIONES[desde] as readonly string[]).includes(hasta);
}

/** Estados where the unit is still the shop's responsibility. Drives the "abiertas" filter. */
export const NOTA_ESTADOS_ABIERTOS = NOTA_ESTADO_KEYS.filter((e) => e !== "entregada" && e !== "cancelada");

/**
 * The fuel gauge, in eighths — what the needle actually shows. Storing a percentage would invent
 * precision nobody can read off a dashboard.
 */
export const COMBUSTIBLE_MAX = 8;
export const COMBUSTIBLE_LABELS: Record<number, string> = {
	0: "Vacío",
	1: "1/8",
	2: "1/4",
	3: "3/8",
	4: "1/2",
	5: "5/8",
	6: "3/4",
	7: "7/8",
	8: "Lleno",
};
export const combustibleLabel = (octavos: number | null) =>
	octavos === null ? "Sin registrar" : (COMBUSTIBLE_LABELS[octavos] ?? `${octavos}/8`);

/**
 * What the operator checks off when the vehicle comes in.
 *
 * A fixed catalogue rather than free text: the point of an intake inventory is that the SAME
 * things get checked every time, so a missing jack is noticed on delivery instead of argued about.
 * `obligatorio` items must be answered before the inspection counts as complete.
 */
export const INVENTARIO_ITEMS = {
	llanta_refaccion: { label: "Llanta de refacción", obligatorio: true },
	gato: { label: "Gato", obligatorio: true },
	llave_cruz: { label: "Llave de cruz", obligatorio: true },
	herramienta: { label: "Herramienta", obligatorio: false },
	estereo: { label: "Estéreo", obligatorio: true },
	tapetes: { label: "Tapetes", obligatorio: false },
	tapones_rueda: { label: "Tapones de rueda", obligatorio: false },
	extintor: { label: "Extintor", obligatorio: false },
	triangulos: { label: "Triángulos de seguridad", obligatorio: false },
	cables_pasacorriente: { label: "Cables pasacorriente", obligatorio: false },
	documentos: { label: "Documentos (tarjeta de circulación, póliza)", obligatorio: true },
	placas_delantera: { label: "Placa delantera", obligatorio: false },
	antena: { label: "Antena", obligatorio: false },
	otros: { label: "Otros objetos personales", obligatorio: false },
} as const satisfies Record<string, { label: string; obligatorio: boolean }>;

export type InventarioItem = keyof typeof INVENTARIO_ITEMS;
export const INVENTARIO_ITEM_KEYS = Object.keys(INVENTARIO_ITEMS) as InventarioItem[];
export const isInventarioItem = (v: unknown): v is InventarioItem =>
	typeof v === "string" && Object.hasOwn(INVENTARIO_ITEMS, v);
export const inventarioLabel = (v: string) => (isInventarioItem(v) ? INVENTARIO_ITEMS[v].label : v);
export const INVENTARIO_OBLIGATORIOS = INVENTARIO_ITEM_KEYS.filter((k) => INVENTARIO_ITEMS[k].obligatorio);

/**
 * Evidence attached to a nota: intake photos, a signed quote, a partner shop's report.
 * One table, discriminated by `tipo`, because they all answer "what proves this happened".
 */
export const EVIDENCIA_TIPOS = {
	foto: { label: "Foto", acepta: "image/*" },
	documento: { label: "Documento", acepta: "application/pdf,image/*" },
	audio: { label: "Audio", acepta: "audio/*" },
	video: { label: "Video", acepta: "video/*" },
} as const satisfies Record<string, { label: string; acepta: string }>;

export type EvidenciaTipo = keyof typeof EVIDENCIA_TIPOS;
export const EVIDENCIA_TIPO_KEYS = Object.keys(EVIDENCIA_TIPOS) as EvidenciaTipo[];
export const isEvidenciaTipo = (v: unknown): v is EvidenciaTipo =>
	typeof v === "string" && Object.hasOwn(EVIDENCIA_TIPOS, v);

/**
 * Content types accepted for upload. Anything else is refused **before a URL is ever signed**.
 *
 * An allowlist and not a blocklist, and it is what keeps `image/svg+xml` and `text/html` out: a
 * bucket that serves those is an XSS, and no amount of "we only upload photos" in a comment
 * prevents somebody uploading one.
 *
 * The value is the `tipo` the row gets — the mime IS the classification, so a caller cannot label
 * a video as a photo and have it render in an `<img>`.
 */
export const TIPOS_MIME_PERMITIDOS = {
	"image/jpeg": "foto",
	"image/png": "foto",
	"image/webp": "foto",
	"image/heic": "foto",
	"application/pdf": "documento",
	// Voice notes. `audio/mp4` and `audio/webm` are what a phone's recorder actually produces;
	// `audio/mpeg` is an mp3 somebody picked from their files.
	"audio/mpeg": "audio",
	"audio/mp4": "audio",
	"audio/webm": "audio",
	"audio/ogg": "audio",
	"audio/wav": "audio",
	"audio/x-m4a": "audio",
	// Ten seconds of a noise says what a paragraph cannot. `video/quicktime` is what an iPhone
	// sends when it is not transcoding.
	"video/mp4": "video",
	"video/webm": "video",
	"video/quicktime": "video",
} as const satisfies Record<string, EvidenciaTipo>;

export type MimePermitido = keyof typeof TIPOS_MIME_PERMITIDOS;
export const MIME_KEYS = Object.keys(TIPOS_MIME_PERMITIDOS) as MimePermitido[];
export const esMimePermitido = (v: unknown): v is MimePermitido =>
	typeof v === "string" && Object.hasOwn(TIPOS_MIME_PERMITIDOS, v);

/** The `tipo` a file gets from its own content type. Never taken from the caller. */
export const tipoDeMime = (mime: string): EvidenciaTipo =>
	esMimePermitido(mime) ? TIPOS_MIME_PERMITIDOS[mime] : "documento";

/** `accept=` for a file input that takes anything we store. */
export const ACEPTA_TODO = MIME_KEYS.join(",");

/** 20 MB. A phone photo is 3–8 MB; a PDF report rarely more. */
export const TAMANO_MAXIMO_BYTES = 20 * 1024 * 1024;

/**
 * Video gets its own, larger cap: 20 MB is about eight seconds of 4K, which is not a clip of a
 * noise, it is the start of one. The file goes STRAIGHT to R2 (presigned PUT), so a bigger limit
 * costs the server nothing — the ceiling is what the shop's upload actually manages on a phone.
 */
export const TAMANO_MAXIMO_VIDEO_BYTES = 200 * 1024 * 1024;

export const limiteDeTipo = (tipo: string): number =>
	tipo === "video" ? TAMANO_MAXIMO_VIDEO_BYTES : TAMANO_MAXIMO_BYTES;

export const megas = (bytes: number) => Math.round(bytes / 1024 / 1024);

/** Where a photo was taken. Drives the gallery's grouping and the "missing angles" hint. */
export const FOTO_CATEGORIAS = {
	frente: { label: "Frente", sugerida: true },
	trasera: { label: "Trasera", sugerida: true },
	lateral_izquierdo: { label: "Lateral izquierdo", sugerida: true },
	lateral_derecho: { label: "Lateral derecho", sugerida: true },
	interior: { label: "Interior", sugerida: true },
	tablero: { label: "Tablero (kilometraje y combustible)", sugerida: true },
	motor: { label: "Motor", sugerida: false },
	dano: { label: "Daño", sugerida: false },
	otra: { label: "Otra", sugerida: false },
} as const satisfies Record<string, { label: string; sugerida: boolean }>;

export type FotoCategoria = keyof typeof FOTO_CATEGORIAS;
export const FOTO_CATEGORIA_KEYS = Object.keys(FOTO_CATEGORIAS) as FotoCategoria[];
export const isFotoCategoria = (v: unknown): v is FotoCategoria =>
	typeof v === "string" && Object.hasOwn(FOTO_CATEGORIAS, v);
export const fotoCategoriaLabel = (v: string) => (isFotoCategoria(v) ? FOTO_CATEGORIAS[v].label : v);
/** The angles the shop wants on every intake, so a damage claim later has a before picture. */
export const FOTOS_SUGERIDAS = FOTO_CATEGORIA_KEYS.filter((k) => FOTO_CATEGORIAS[k].sugerida);

/**
 * The verdict when a unit comes back from a partner workshop.
 *
 * Nothing returns from an external shop without somebody signing off on the work. Estación 360
 * is the one the customer holds responsible, so accepting a job back is a decision with a name
 * on it — not a status that flips because the truck showed up in the yard.
 */
export const QA_RESULTADOS = {
	aprobado: {
		label: "Aprobado",
		tone: "ok",
		descripcion: "El trabajo quedó bien y la unidad sigue su curso",
	},
	con_detalles: {
		label: "Aprobado con detalles",
		tone: "warn",
		descripcion: "Se acepta, pero hay observaciones que quedan asentadas",
	},
	rechazado: {
		label: "Rechazado",
		tone: "danger",
		descripcion: "El trabajo no pasa: se documenta y se regresa al taller",
	},
} as const satisfies Record<string, { label: string; tone: Tone; descripcion: string }>;

export type QaResultado = keyof typeof QA_RESULTADOS;
/** What a person may choose. `no_aplica` is not here on purpose — see below. */
export const QA_RESULTADO_KEYS = Object.keys(QA_RESULTADOS) as QaResultado[];
export const isQaResultado = (v: unknown): v is QaResultado => typeof v === "string" && Object.hasOwn(QA_RESULTADOS, v);

/**
 * Set only when a note is CANCELLED while a unit is still out: the transfer has to close, and
 * there is nothing to assess. It is deliberately not offerable in the UI — recording a quality
 * check that never happened would be worse than saying so.
 */
export const QA_NO_APLICA = "no_aplica";

export const qaResultadoLabel = (v: string | null) =>
	v === QA_NO_APLICA ? "No aplica (nota cancelada)" : v && isQaResultado(v) ? QA_RESULTADOS[v].label : "Sin revisar";
export const qaResultadoTone = (v: string | null): Tone => (v && isQaResultado(v) ? QA_RESULTADOS[v].tone : "neutral");

/**
 * Where the unit ends up. A SECOND decision, separate from the verdict.
 *
 * "The work was bad" and "who has the vehicle" are two different facts. Collapsing them meant a
 * rejection could only ever leave the unit with the shop that botched it — so the honest answer to
 * a bad repair ("take it back, I'll send it somewhere else") was unreachable without approving work
 * that was not approved.
 *
 * The unit is never released to the CUSTOMER on a rejection either way: it comes back to Estación
 * 360, which is who answers for the repair.
 */
export const QA_DESTINOS = {
	retrabajo: {
		label: "Se queda en ese taller",
		descripcion: "Que lo corrijan ellos. La unidad sigue bajo su responsabilidad",
	},
	retorno: {
		label: "Regresa a Estación 360",
		descripcion: "La recuperamos para terminarla aquí o mandarla a otro taller",
	},
} as const satisfies Record<string, { label: string; descripcion: string }>;

export type QaDestino = keyof typeof QA_DESTINOS;
export const QA_DESTINO_KEYS = Object.keys(QA_DESTINOS) as QaDestino[];
export const isQaDestino = (v: unknown): v is QaDestino => typeof v === "string" && Object.hasOwn(QA_DESTINOS, v);

/**
 * What happens when nobody says. A rejection defaults to rework — the shop that did it badly is
 * the one that owes the fix — and anything accepted always comes back.
 */
export const qaDestinoPorDefecto = (v: string): QaDestino => (v === "rechazado" ? "retrabajo" : "retorno");

/**
 * Does the unit stay with the partner shop? Only a rejection left for rework does.
 *
 * The whole rule in one place: an accepted job always comes back no matter what `destino` says,
 * and a rejection is a verdict on the work rather than a sentence tying the vehicle to the shop
 * that botched it. Pure so `check-notas.ts` can pin every combination.
 */
export const qaSigueEnTaller = (resultado: string, destino: QaDestino) =>
	resultado === "rechazado" && destino === "retrabajo";

/** Where a mileage reading came from. `nota` readings are the ones that mark a shop visit. */
export const ORIGENES_KILOMETRAJE = {
	nota: "Entrada al taller",
	alta: "Alta de la unidad",
	manual: "Captura manual",
} as const;

export type OrigenKilometraje = keyof typeof ORIGENES_KILOMETRAJE;
export const isOrigenKilometraje = (v: unknown): v is OrigenKilometraje =>
	typeof v === "string" && Object.hasOwn(ORIGENES_KILOMETRAJE, v);
export const origenKilometrajeLabel = (v: string) => (isOrigenKilometraje(v) ? ORIGENES_KILOMETRAJE[v] : v);
