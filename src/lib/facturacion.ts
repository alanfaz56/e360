/**
 * CFDI vocabulary and the arithmetic of a stamped invoice. Pure, browser-safe, no PAC in sight —
 * pinned by `check-facturacion.ts`.
 *
 * This file is deliberately provider-neutral: it is the SAT's rules, which every PAC implements
 * the same way because the SAT is the one who checks them. What is provider-specific — endpoints,
 * headers, field names — lives in `server/pac/` behind the `ProveedorTimbrado` port.
 *
 * Claves, never labels: `formaPago` is `"03"`, not "Transferencia". Same rule as
 * `cliente.regimenFiscal`, and the same mistake that produced the original
 * `value too long for the column's type` bug.
 */

import { centavos } from "./comercial";
import {
	CLAVE_PROD_SERV_DEFAULT,
	CLAVE_UNIDAD_DEFAULT,
	CLAVE_UNIDAD_SERVICIO,
	claveUnidadLabel,
	esClaveProdServ,
} from "./sat-catalogos";

/**
 * c_FormaPago, mapped from our own `pago.metodo`.
 *
 * A curated slice, not the whole catalogue: these are the five ways this shop actually gets paid,
 * and the SAT's list has 20+ entries nobody here will ever pick.
 */
export const FORMAS_PAGO = {
	efectivo: { clave: "01", label: "Efectivo" },
	cheque: { clave: "02", label: "Cheque nominativo" },
	transferencia: { clave: "03", label: "Transferencia electrónica" },
	tarjeta: { clave: "04", label: "Tarjeta de crédito" },
	otro: { clave: "99", label: "Por definir" },
} as const satisfies Record<string, { clave: string; label: string }>;

export type MetodoPagoInterno = keyof typeof FORMAS_PAGO;

/**
 * The SAT clave for how an invoice was paid.
 *
 * **`99` (por definir) when nothing was paid yet**, which is the honest answer for a credit sale:
 * the CFDI is issued before the money arrives and picking a form of payment then would be
 * inventing one. Anything unknown lands there too rather than defaulting to cash.
 */
export const formaPagoClave = (metodo: string | null | undefined): string =>
	// `Object.hasOwn`, never `in`: `in` walks the prototype chain, so "constructor" and "__proto__"
	// pass and then index into `undefined`. Every registry guard in the app follows this rule.
	metodo && Object.hasOwn(FORMAS_PAGO, metodo) ? FORMAS_PAGO[metodo as MetodoPagoInterno].clave : "99";

/**
 * c_MetodoPago. Two values, and the choice is not cosmetic: PPD obliges the shop to issue a
 * *complemento de pago* for every payment received afterwards, PUE does not.
 */
export const METODOS_PAGO = {
	contado: { clave: "PUE", label: "Pago en una sola exhibición" },
	credito: { clave: "PPD", label: "Pago en parcialidades o diferido" },
} as const satisfies Record<string, { clave: string; label: string }>;

export const metodoPagoClave = (condicionPago: string): string =>
	condicionPago === "credito" ? METODOS_PAGO.credito.clave : METODOS_PAGO.contado.clave;

/**
 * The four reasons the SAT accepts for cancelling a CFDI.
 *
 * `01` is the only one that names a replacement, and the pair is enforced by
 * `factura_cancelacion_sustituye_check` — the app refuses first so the message is in Spanish.
 */
export const MOTIVOS_CANCELACION = {
	"01": {
		label: "Comprobante emitido con errores CON relación",
		descripcion: "Ya existe la factura que la sustituye. Hay que dar su UUID.",
		requiereSustituto: true,
	},
	"02": {
		label: "Comprobante emitido con errores SIN relación",
		descripcion: "Se emitió mal y no hay una factura que la reemplace.",
		requiereSustituto: false,
	},
	"03": {
		label: "No se llevó a cabo la operación",
		descripcion: "El servicio nunca se prestó.",
		requiereSustituto: false,
	},
	"04": {
		label: "Operación nominativa relacionada en una factura global",
		descripcion: "Quedó incluida en una factura global.",
		requiereSustituto: false,
	},
} as const satisfies Record<string, { label: string; descripcion: string; requiereSustituto: boolean }>;

export type MotivoCancelacion = keyof typeof MOTIVOS_CANCELACION;
export const MOTIVO_CANCELACION_KEYS = Object.keys(MOTIVOS_CANCELACION) as MotivoCancelacion[];
export const esMotivoCancelacion = (v: unknown): v is MotivoCancelacion =>
	typeof v === "string" && Object.hasOwn(MOTIVOS_CANCELACION, v);
export const requiereSustituto = (motivo: string): boolean =>
	esMotivoCancelacion(motivo) && MOTIVOS_CANCELACION[motivo].requiereSustituto;

/** A UUID as the SAT writes it. Checked before a cancellation is sent, not after it is refused. */
export const esUuid = (v: unknown): v is string =>
	typeof v === "string" && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);

/** `ObjetoImp` 02: this line is subject to tax. 01 (not subject) has no `Impuestos` node at all. */
export const OBJETO_IMPUESTO = "02";
/** c_Impuesto: 002 is IVA. */
export const IMPUESTO_IVA = "002";
/** c_TipoFactor: a rate, not a fee. */
export const TIPO_FACTOR_TASA = "Tasa";

/**
 * Spread the invoice's IVA across its lines so the parts add up to EXACTLY the whole.
 *
 * The shop computes IVA once, on the rounded subtotal — that is what stops the invoice total from
 * disagreeing with the sum of its own lines. A CFDI, though, carries tax per concepto, and
 * `round(importe × 0.16)` line by line does not reliably sum back to `round(subtotal × 0.16)`:
 * three lines of 33.33 round up individually and the CFDI ends up one cent heavier than its own
 * total. The SAT rejects that outright.
 *
 * So: round each line, then push the whole leftover onto the largest line, where a cent is the
 * smallest relative distortion. Returns cents, and the sum is guaranteed to equal `ivaTotal` —
 * `check-facturacion.ts` asserts it over awkward splits.
 */
export function distribuirIva(importes: bigint[], ivaTotal: bigint, tasa = 0.16): bigint[] {
	if (importes.length === 0) return [];

	const porLinea = importes.map((i) => BigInt(Math.round(Number(i) * tasa)));
	const suma = porLinea.reduce((a, b) => a + b, 0n);
	const sobra = ivaTotal - suma;
	if (sobra === 0n) return porLinea;

	// The largest line by amount. Not the first: putting the adjustment on a $12 line next to a
	// $8,000 one is where somebody notices the numbers look hand-edited.
	let mayor = 0;
	for (let i = 1; i < importes.length; i++) if (importes[i] > importes[mayor]) mayor = i;

	porLinea[mayor] += sobra;
	// A correction cannot turn a line's tax negative — that would be a different kind of wrong.
	if (porLinea[mayor] < 0n) porLinea[mayor] = 0n;
	return porLinea;
}

/**
 * A line of a CFDI, in OUR vocabulary: cents, not strings; our own claves already resolved.
 *
 * The adapter turns this into whatever shape its provider wants. Keeping the port in our own terms
 * is what makes a second PAC a translation instead of a rewrite.
 */
export type ConceptoCfdi = {
	claveProdServ: string;
	claveUnidad: string;
	unidad: string;
	descripcion: string;
	/** May be fractional: 1.5 hours of labour is a real line. */
	cantidad: number;
	/** Cents. */
	valorUnitario: bigint;
	/** Cents. `cantidad × valorUnitario`, already rounded. */
	importe: bigint;
	/** Cents. From `distribuirIva`, so the lines sum to the invoice's IVA exactly. */
	iva: bigint;
	/** The shop's own product code, when the line came from the catalogue. */
	noIdentificacion: string | null;
};

/** The shape of a quote line this needs. Loose so a self-check can build one by hand. */
export type ConceptoFuente = {
	tipo: string;
	descripcion: string;
	cantidad: { toString(): string };
	precioUnitario: { toString(): string };
	importe: { toString(): string };
	claveProdServ: string | null;
	claveUnidad: string | null;
	productoId: string | null;
};

/**
 * Quote lines → CFDI lines, with the tax split so the parts sum to the whole.
 *
 * Pure and here rather than beside the stamping code so `check-facturacion.ts` can pin it without
 * a database: a cent missing between the sum of the lines and the invoice total is exactly the
 * kind of bug that only shows up when the SAT rejects the document.
 */
export function armarConceptos(filas: ConceptoFuente[], ivaTotal: bigint, tasa = 0.16): ConceptoCfdi[] {
	const importes = filas.map((f) => centavos(f.importe.toString()) ?? 0n);
	const ivas = distribuirIva(importes, ivaTotal, tasa);

	return filas.map((f, i) => {
		// Labour and sublet work are measured in services, parts in pieces. Getting this wrong is
		// not fatal, but it is what makes a CFDI read as machine-generated nonsense.
		const esServicio = f.tipo === "mano_obra" || f.tipo === "externo";
		const claveUnidad = f.claveUnidad ?? (esServicio ? CLAVE_UNIDAD_SERVICIO : CLAVE_UNIDAD_DEFAULT);
		// The line's own clave when it has one — copied at the moment it was quoted, never read back
		// through the product now. Falling back by tipo beats sending nothing and being rejected.
		const claveProdServ = esClaveProdServ(f.claveProdServ)
			? f.claveProdServ
			: (CLAVE_PROD_SERV_DEFAULT[f.tipo] ?? CLAVE_PROD_SERV_DEFAULT.refaccion);

		return {
			claveProdServ,
			claveUnidad,
			unidad: claveUnidadLabel(claveUnidad),
			descripcion: f.descripcion,
			cantidad: Number(f.cantidad.toString()),
			valorUnitario: centavos(f.precioUnitario.toString()) ?? 0n,
			importe: importes[i],
			iva: ivas[i],
			noIdentificacion: f.productoId,
		};
	});
}

/** Everything needed to stamp, with nothing provider-shaped in it. */
export type SolicitudTimbrado = {
	/** The receptor, already registered with the provider. */
	receptorId: string;
	rfc: string;
	usoCfdi: string;
	/** `PUE` | `PPD`. */
	metodoPago: string;
	/** c_FormaPago clave. */
	formaPago: string;
	serie: string;
	moneda: string;
	conceptos: ConceptoCfdi[];
	/** Cents. Recomputed from the lines by the adapter and compared — never trusted. */
	subtotal: bigint;
	iva: bigint;
	total: bigint;
	/** Shows on the CFDI. Our folio, so a customer calling about "la 1042" is findable. */
	observaciones: string | null;
};

/** What every provider must answer with. Anything else is theirs to keep. */
export type ResultadoTimbrado = {
	uuid: string;
	/** The provider's own id for the document — needed to fetch the PDF/XML or cancel it. */
	referencia: string;
	serie: string | null;
	folio: string | null;
	timbradaAt: Date;
};

export type ResultadoCancelacion = {
	/** `cancelada` | `en_proceso` | `rechazada` — normalized, never the provider's own wording. */
	estatus: EstatusCancelacion;
	mensaje: string;
};

export const ESTATUS_CANCELACION = {
	cancelada: { label: "Cancelada ante el SAT", tone: "danger" },
	en_proceso: { label: "Cancelación en proceso", tone: "warn" },
	rechazada: { label: "El SAT rechazó la cancelación", tone: "warn" },
} as const satisfies Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "danger" | "brand" }>;

export type EstatusCancelacion = keyof typeof ESTATUS_CANCELACION;
export const esEstatusCancelacion = (v: unknown): v is EstatusCancelacion =>
	typeof v === "string" && Object.hasOwn(ESTATUS_CANCELACION, v);
export const estatusCancelacionLabel = (v: string | null | undefined) =>
	v && esEstatusCancelacion(v) ? ESTATUS_CANCELACION[v].label : "Sin solicitar";

/** The two environments. `sandbox` never produces a fiscal document, whatever it returns. */
export const ENTORNOS = ["sandbox", "produccion"] as const;
export type Entorno = (typeof ENTORNOS)[number];
export const esEntorno = (v: unknown): v is Entorno =>
	typeof v === "string" && (ENTORNOS as readonly string[]).includes(v);
export const entornoLabel = (v: string) => (v === "produccion" ? "Producción" : "Sandbox");
