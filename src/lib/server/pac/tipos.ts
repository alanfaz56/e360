/**
 * The port every stamping provider plugs into.
 *
 * A PAC is a vendor decision, not an architectural one: Facturama, SW sapien, Finkok and
 * factura.com all stamp the same CFDI because the SAT is what actually validates it. So the seam
 * is drawn where the vocabulary is OURS — cents, our estados, our claves — and an adapter's job is
 * to translate, not to leak its own shape upward.
 *
 * It is a plain object of functions, not a class and not an interface hierarchy. Adding a second
 * provider is one file plus one line in the registry.
 *
 * Rules an adapter must keep, because callers depend on them:
 *
 * - **Missing credentials → `ClienteError(503)`.** Never a silent no-op and never a fake success.
 *   Same fail-closed rule as Turnstile and R2.
 * - **Anything the provider says about the caller's input → `ClienteError(4xx)`** with the
 *   provider's Spanish message, which is written for the person who has to fix it ("el RFC no
 *   existe en la lista del SAT"). Anything else throws and becomes a reference in the log — see
 *   `server/errores.ts`.
 * - **Never return the provider's raw payload.** The types below are the whole contract.
 */
import type { ResultadoCancelacion, ResultadoTimbrado, SolicitudTimbrado } from "$lib/facturacion";

/** Credentials and environment, already read and decrypted. Adapters never touch the settings. */
export type ConfigPac = {
	entorno: "sandbox" | "produccion";
	apiKey: string;
	secretKey: string;
	serie: string;
};

/** The customer, in our terms. The adapter maps it to whatever a "receptor" is called over there. */
export type DatosReceptor = {
	rfc: string;
	nombre: string;
	codigoPostal: string;
	regimenFiscal: string;
	usoCfdi: string;
	email: string | null;
	/** Optional everywhere. A receptor with an address reads like a real customer on the CFDI. */
	calle: string | null;
	numero: string | null;
	colonia: string | null;
	ciudad: string | null;
	estado: string | null;
};

export type Documento = {
	/** The bytes. Streamed straight to the browser — never stored, never re-signed. */
	contenido: Uint8Array;
	contentType: string;
	nombre: string;
};

export type ProveedorTimbrado = {
	/** Stable id. Stored in `facturacion.proveedor` and never translated for display. */
	readonly clave: string;
	readonly label: string;

	/**
	 * Find or create the receptor and return the provider's id for it.
	 *
	 * Separate from `timbrar` because the id is worth keeping: it is written to
	 * `cliente.facturaComUid` and reused, so a customer is registered once and not on every sale.
	 */
	asegurarReceptor(cfg: ConfigPac, datos: DatosReceptor, idExistente: string | null): Promise<string>;

	/**
	 * The receptor as the PAC currently has it on file, in OUR terms — never their raw payload,
	 * same rule as everywhere else in this port. For checking what is actually registered over
	 * there against what our own record says, e.g. tracking down a CFDI40145 name mismatch.
	 * `null` when this RFC has no receptor registered yet.
	 */
	obtenerReceptor(cfg: ConfigPac, rfc: string): Promise<DatosReceptor | null>;

	timbrar(cfg: ConfigPac, solicitud: SolicitudTimbrado): Promise<ResultadoTimbrado>;

	/**
	 * Cancel at the SAT. `sustituye` is the replacement UUID, required only for motivo `01`.
	 *
	 * SAT cancellation is asynchronous and can sit waiting for the receiver to accept, so the
	 * answer is a status, never a boolean.
	 */
	cancelar(
		cfg: ConfigPac,
		referencia: string,
		motivo: string,
		sustituye: string | null,
	): Promise<ResultadoCancelacion>;

	/** The stamped document, as the SAT and the customer's accountant recognise it. */
	descargar(cfg: ConfigPac, referencia: string, formato: "pdf" | "xml"): Promise<Documento>;
};
