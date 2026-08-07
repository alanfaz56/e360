/**
 * factura.com, behind the `ProveedorTimbrado` port.
 *
 * Everything provider-specific is here: hosts, headers, paths, field names and the shape of their
 * answers. Nothing above this file knows factura.com exists — swapping to another PAC is a second
 * file like this one plus a line in `PROVEEDORES`.
 *
 * The API is a plain JSON HTTP API, so this is `fetch` and nothing else. No SDK, same reasoning as
 * `sigv4.ts` and `webpush.ts`: a dependency for six endpoints is a dependency to keep up to date.
 */
import {
	IMPUESTO_IVA,
	OBJETO_IMPUESTO,
	TIPO_FACTOR_TASA,
	type ResultadoCancelacion,
	type ResultadoTimbrado,
	type SolicitudTimbrado,
} from "$lib/facturacion";
import { pesos } from "$lib/comercial";
import { ClienteError } from "../clientes";
import type { ConfigPac, DatosReceptor, Documento, ProveedorTimbrado } from "./tipos";

/**
 * Their fixed plugin identifier, published in the docs and the same for every integrator. It is
 * not a secret and it is not per-account, which is why it is a constant here instead of a setting
 * somebody would have to paste.
 */
const F_PLUGIN = "9d4095c8f7ed5785cb14c0e3b033eeb8252416ed";

const HOSTS = {
	sandbox: "https://sandbox.factura.com/api",
	produccion: "https://api.factura.com",
} as const;

/**
 * Every path this adapter uses, in one place.
 *
 * They come from the public docs. When one of them turns out to be off by a segment, it is a
 * one-line correction here and nothing else in the app moves — which is the entire reason they are
 * not inlined at their call sites.
 */
const RUTAS = {
	clientePorRfc: (rfc: string) => `/v1/clients/${encodeURIComponent(rfc)}`,
	crearCliente: "/v1/clients/create",
	timbrar: "/v4/cfdi40/create",
	cancelar: (uid: string) => `/v4/cfdi40/${encodeURIComponent(uid)}/cancel`,
	descargar: (uid: string, formato: "pdf" | "xml") => `/v4/cfdi40/${encodeURIComponent(uid)}/${formato}`,
} as const;

/** How long we wait before giving up. Stamping is synchronous at the SAT and genuinely slow. */
const TIMEOUT_MS = 30_000;

type Envoltura = {
	response?: string;
	status?: string;
	message?: unknown;
	[k: string]: unknown;
};

/**
 * One request, with the whole error contract in one place.
 *
 * Their envelope is `{ response: "success" | "error", message }` on some endpoints and
 * `{ status: "error", message: {campo: [...]}}` on others, so both are handled — and neither ever
 * reaches a user as-is unless it is a sentence.
 */
async function pedir(cfg: ConfigPac, ruta: string, init: RequestInit = {}): Promise<Envoltura> {
	const res = await llamar(cfg, ruta, init);
	const texto = await res.text();

	let cuerpo: Envoltura;
	try {
		cuerpo = JSON.parse(texto) as Envoltura;
	} catch {
		// HTML from a proxy, an empty body, a maintenance page. Not something to show anybody.
		console.error(`[factura.com] respuesta no-JSON de ${ruta}`, res.status, texto.slice(0, 500));
		throw new ClienteError(502, "El proveedor de timbrado respondió algo que no entendimos.");
	}

	const fallo = cuerpo.response === "error" || cuerpo.status === "error" || !res.ok;
	if (fallo) {
		const mensaje = mensajeDeError(cuerpo);
		console.error(`[factura.com] ${ruta} → ${res.status}`, JSON.stringify(cuerpo).slice(0, 1000));
		// 4xx is theirs to fix (a bad RFC, a missing régimen); 5xx is the PAC being down. Both get
		// the provider's own sentence when there is one, because it names the field.
		throw new ClienteError(res.status >= 500 || res.ok ? 502 : res.status, mensaje);
	}

	return cuerpo;
}

async function llamar(cfg: ConfigPac, ruta: string, init: RequestInit): Promise<Response> {
	const url = `${HOSTS[cfg.entorno]}${ruta}`;
	try {
		return await fetch(url, {
			...init,
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				"F-PLUGIN": F_PLUGIN,
				"F-Api-Key": cfg.apiKey,
				"F-Secret-Key": cfg.secretKey,
				...(init.headers ?? {}),
			},
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch (err) {
		// A dead network or a timeout. Neither is something the counter can act on beyond retrying,
		// and neither may surface as "TypeError: fetch failed".
		console.error(`[factura.com] no se pudo alcanzar ${url}`, err);
		throw new ClienteError(504, "No pudimos contactar al proveedor de timbrado. Inténtalo otra vez.");
	}
}

/**
 * Their `message` is a string on most endpoints and `{campo: ["…"]}` on the validation ones.
 *
 * Both are written in Spanish for whoever is fixing the data ("El campo rfc debe ser menor que 13
 * caracteres"), which is why they are passed through instead of being replaced by a generic —
 * this is the same exception `ClienteError` gets everywhere else in the app.
 */
function mensajeDeError(cuerpo: Envoltura): string {
	const m = cuerpo.message;
	if (typeof m === "string" && m.trim()) return m.trim();
	if (m && typeof m === "object") {
		const partes = Object.values(m as Record<string, unknown>)
			.flatMap((v) => (Array.isArray(v) ? v : [v]))
			.filter((v): v is string => typeof v === "string" && v.trim() !== "");
		if (partes.length > 0) return partes.join(" ");
	}
	return "El proveedor de timbrado rechazó la operación.";
}

/** Their ids come back under several names depending on the endpoint. */
const primerTexto = (...valores: unknown[]): string | null => {
	for (const v of valores) {
		if (typeof v === "string" && v.trim()) return v.trim();
		if (typeof v === "number") return String(v);
	}
	return null;
};

const comoObjeto = (v: unknown): Record<string, unknown> =>
	v && typeof v === "object" ? (v as Record<string, unknown>) : {};

export const facturaCom: ProveedorTimbrado = {
	clave: "factura_com",
	label: "factura.com",

	/**
	 * Look the receptor up by RFC first, create only if absent.
	 *
	 * Lookup-then-create rather than create-and-ignore-the-conflict: their create endpoint answers
	 * a validation error for a duplicate RFC, and telling those apart from a genuinely bad RFC by
	 * string-matching the message is exactly the kind of thing that breaks when they reword it.
	 */
	async asegurarReceptor(cfg, datos, idExistente) {
		if (idExistente) return idExistente;

		// A 404 here means "not registered yet", which is the normal path, not a failure.
		const encontrado = await pedir(cfg, RUTAS.clientePorRfc(datos.rfc)).catch((err) => {
			if (err instanceof ClienteError && err.status === 404) return null;
			throw err;
		});

		if (encontrado) {
			const uid = primerTexto(
				encontrado.UID,
				encontrado.uid,
				comoObjeto(encontrado.Data).UID,
				comoObjeto(encontrado.data).uid,
			);
			if (uid) return uid;
		}

		const creado = await pedir(cfg, RUTAS.crearCliente, {
			method: "POST",
			body: JSON.stringify({
				rfc: datos.rfc,
				razons: datos.nombre,
				codpos: datos.codigoPostal,
				regimen: datos.regimenFiscal,
				usocfdi: datos.usoCfdi,
				...(datos.email ? { email: datos.email } : {}),
			}),
		});

		const uid = primerTexto(creado.UID, creado.uid, comoObjeto(creado.Data).UID, comoObjeto(creado.data).uid);
		if (!uid) {
			console.error(
				"[factura.com] alta de cliente sin UID en la respuesta",
				JSON.stringify(creado).slice(0, 500),
			);
			throw new ClienteError(502, "El proveedor no devolvió el identificador del cliente.");
		}
		return uid;
	},

	async timbrar(cfg, solicitud) {
		const cuerpo = {
			Receptor: { UID: solicitud.receptorId },
			TipoDocumento: "factura",
			UsoCFDI: solicitud.usoCfdi,
			Serie: Number(solicitud.serie) || solicitud.serie,
			FormaPago: solicitud.formaPago,
			MetodoPago: solicitud.metodoPago,
			Moneda: solicitud.moneda,
			// Their API stamps immediately unless told otherwise; being explicit means a change to
			// their default cannot turn every invoice into a draft nobody notices.
			BorradorSiFalla: 0,
			EnviarCorreo: false,
			...(solicitud.observaciones ? { Comentarios: solicitud.observaciones } : {}),
			Conceptos: solicitud.conceptos.map((c) => ({
				ClaveProdServ: c.claveProdServ,
				...(c.noIdentificacion ? { NoIdentificacion: c.noIdentificacion } : {}),
				Cantidad: c.cantidad,
				ClaveUnidad: c.claveUnidad,
				Unidad: c.unidad,
				Descripcion: c.descripcion,
				ValorUnitario: pesos(c.valorUnitario),
				Importe: pesos(c.importe),
				Descuento: "0.00",
				ObjetoImp: OBJETO_IMPUESTO,
				Impuestos: {
					Traslados: [
						{
							Base: pesos(c.importe),
							Impuesto: IMPUESTO_IVA,
							TipoFactor: TIPO_FACTOR_TASA,
							TasaOCuota: "0.160000",
							Importe: pesos(c.iva),
						},
					],
				},
			})),
		};

		const res = await pedir(cfg, RUTAS.timbrar, { method: "POST", body: JSON.stringify(cuerpo) });

		const sat = comoObjeto(res.SAT);
		const inv = comoObjeto(res.INV);
		const uuid = primerTexto(res.UUID, sat.UUID);
		const referencia = primerTexto(res.invoice_uid, res.uid, res.UID);

		// A success envelope with no UUID is not a success. Better to fail loudly than to write a
		// row that claims to be stamped and cannot be cancelled, downloaded or reconciled.
		if (!uuid || !referencia) {
			console.error("[factura.com] timbrado sin UUID/uid", JSON.stringify(res).slice(0, 1000));
			throw new ClienteError(
				502,
				"El proveedor respondió sin folio fiscal. Revisa en su panel antes de reintentar.",
			);
		}

		return {
			uuid,
			referencia,
			serie: primerTexto(inv.Serie),
			folio: primerTexto(inv.Folio),
			// Their `FechaTimbrado` has no offset, so parsing it invents one. The moment we got the
			// answer is accurate to the second and unambiguous; the SAT's own copy is in the XML.
			timbradaAt: new Date(),
		};
	},

	async cancelar(cfg, referencia, motivo, sustituye) {
		const res = await pedir(cfg, RUTAS.cancelar(referencia), {
			method: "POST",
			body: JSON.stringify({ motivo, ...(sustituye ? { folioSustituto: sustituye } : {}) }),
		});

		const mensaje = typeof res.message === "string" ? res.message : "Cancelación enviada al SAT.";
		// The SAT can hold a cancellation waiting for the receiver to accept it. Their wording for
		// that varies, so it is matched here once and normalized into our own three statuses —
		// nothing above this file ever sees their vocabulary.
		const enProceso = /en proceso|pendiente|espera|aceptaci[oó]n/i.test(mensaje);
		return { estatus: enProceso ? "en_proceso" : "cancelada", mensaje };
	},

	async descargar(cfg, referencia, formato) {
		const res = await llamar(cfg, RUTAS.descargar(referencia, formato), { method: "GET" });
		const bytes = new Uint8Array(await res.arrayBuffer());

		if (!res.ok) {
			console.error(
				`[factura.com] descarga ${formato} → ${res.status}`,
				new TextDecoder().decode(bytes.slice(0, 500)),
			);
			throw new ClienteError(res.status === 404 ? 404 : 502, "No pudimos obtener el documento del proveedor.");
		}

		// Their download endpoints answer JSON on failure and the file on success, so an envelope
		// where bytes were expected is an error that happened to arrive with a 200.
		if (bytes[0] === 0x7b /* { */) {
			const texto = new TextDecoder().decode(bytes);
			console.error(`[factura.com] descarga ${formato} devolvió JSON`, texto.slice(0, 500));
			throw new ClienteError(502, mensajeDeError(JSON.parse(texto) as Envoltura));
		}

		return {
			contenido: bytes,
			contentType: formato === "pdf" ? "application/pdf" : "application/xml",
			nombre: `${referencia}.${formato}`,
		};
	},
};
