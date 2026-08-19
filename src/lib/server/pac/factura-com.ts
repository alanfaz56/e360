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
import { soloTexto } from "$lib/errores";
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
 * Decode the body as UTF-8, whatever the response claims.
 *
 * `res.text()` honours the charset in `Content-Type`, and this API sometimes declares one that is
 * not what it sent — which is how "facturación" reached a screen as "facturaciÃ³n". Their JSON is
 * UTF-8 in practice, so it is decoded as UTF-8 and the header is ignored.
 */
const leerUtf8 = (buf: ArrayBuffer) => new TextDecoder("utf-8").decode(buf);

/**
 * One request, with the whole error contract in one place.
 *
 * Their envelope is `{ response: "success" | "error", message }` on some endpoints and
 * `{ status: "error", message: {campo: [...]}}` on others, so both are handled — and neither ever
 * reaches a user as-is unless it is a sentence.
 */
async function pedir(cfg: ConfigPac, ruta: string, init: RequestInit = {}): Promise<Envoltura> {
	const res = await llamar(cfg, ruta, init);
	const texto = leerUtf8(await res.arrayBuffer());

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
	// `soloTexto` on every path: their messages are written for their own web UI and arrive with
	// markup in them. Escaped, the tags show on screen; unescaped, they would be an injection point
	// in every screen that reports a failure.
	if (typeof m === "string" && m.trim()) return soloTexto(m);
	if (m && typeof m === "object") {
		const partes = Object.values(m as Record<string, unknown>)
			.flatMap((v) => (Array.isArray(v) ? v : [v]))
			.filter((v): v is string => typeof v === "string" && v.trim() !== "")
			.map(soloTexto)
			.filter(Boolean);
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

/** Their two success flags. Some endpoints set `status`, some set `response`, some set both. */
const exito = (cuerpo: Envoltura) => cuerpo.status === "success" || cuerpo.response === "success";

/**
 * A request whose failure is an ANSWER, not an exception.
 *
 * For lookups, where "no existe" is the ordinary case and arrives as HTTP 200 with an error
 * envelope. Returns null only when the call could not be made at all.
 */
async function intentar(cfg: ConfigPac, ruta: string): Promise<Envoltura | null> {
	try {
		const res = await llamar(cfg, ruta, { method: "GET" });
		return JSON.parse(leerUtf8(await res.arrayBuffer())) as Envoltura;
	} catch (err) {
		console.error(`[factura.com] consulta a ${ruta} no se pudo leer`, err);
		return null;
	}
}

/**
 * The client's UID, wherever this API decided to put it on that endpoint.
 *
 * `GET /clients/{rfc}` answers `Data: {…UID}`, `GET /clients/rfc/{rfc}` answers `Data: [{…UID}]`,
 * `GET /clients` answers `data: [...]`, and the create answers `Data: {…UID}`. Four shapes for one
 * id, so it is read once here rather than at each call site.
 */
function uidDeCliente(cuerpo: Envoltura): string | null {
	const candidatos: unknown[] = [cuerpo.UID, cuerpo.uid];
	for (const contenedor of [cuerpo.Data, cuerpo.data]) {
		if (Array.isArray(contenedor)) {
			for (const fila of contenedor) candidatos.push(comoObjeto(fila).UID, comoObjeto(fila).uid);
		} else if (contenedor) {
			candidatos.push(comoObjeto(contenedor).UID, comoObjeto(contenedor).uid);
		}
	}
	return primerTexto(...candidatos);
}

/**
 * The receptor's own fields, wherever this API decided to put them — same reasoning as
 * `uidDeCliente`: their casing and param names are not the same on the way out as on the way in
 * (`razons` in, `RazonSocial` or `razons` out, depending on the day), so every candidate key is
 * tried and the first one that answers wins. Returns `null` when the envelope holds no client.
 */
function receptorDeCliente(cuerpo: Envoltura): DatosReceptor | null {
	const filas: Record<string, unknown>[] = [];
	for (const contenedor of [cuerpo.Data, cuerpo.data]) {
		if (Array.isArray(contenedor)) filas.push(...contenedor.map(comoObjeto));
		else if (contenedor) filas.push(comoObjeto(contenedor));
	}
	const fila = filas[0];
	if (!fila) return null;

	const campo = (...claves: string[]) => primerTexto(...claves.map((k) => fila[k]));
	return {
		rfc: campo("Rfc", "rfc") ?? "",
		nombre: campo("RazonSocial", "razons", "Nombre", "nombre") ?? "",
		codigoPostal: campo("CodigoPostal", "codpos", "cp") ?? "",
		regimenFiscal: campo("RegimenFiscal", "regimen") ?? "",
		usoCfdi: campo("UsoCFDI", "usocfdi", "UsoCfdi") ?? "",
		email: campo("Email", "email"),
		calle: campo("Calle", "calle"),
		numero: campo("NumeroExterior", "numero_exterior", "numero"),
		colonia: campo("Colonia", "colonia"),
		ciudad: campo("Ciudad", "ciudad"),
		estado: campo("Estado", "estado"),
	};
}

export const facturaCom: ProveedorTimbrado = {
	clave: "factura_com",
	label: "factura.com",

	/**
	 * Look the receptor up by RFC first, create only if absent.
	 *
	 * **"Not registered yet" does NOT arrive as a 404.** This API answers HTTP 200 with
	 * `{"status":"error","message":"El cliente no existe"}`, which is why the lookup goes through
	 * `intentar` — a call that hands back the envelope instead of throwing on it. Treating that as
	 * a failure is what produced "El cliente no existe" on the stamping screen: the normal path,
	 * reported as a breakdown.
	 *
	 * It is deliberately NOT matched on their wording. Any unsuccessful lookup falls through to the
	 * create, and if the real cause was bad credentials or a malformed RFC, the create fails too
	 * and surfaces THAT — so nothing is silently swallowed and nothing depends on a string they
	 * are free to reword.
	 */
	async asegurarReceptor(cfg, datos, idExistente) {
		if (idExistente) return idExistente;

		const encontrado = await intentar(cfg, RUTAS.clientePorRfc(datos.rfc));
		if (encontrado && exito(encontrado)) {
			const uid = uidDeCliente(encontrado);
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
				// Everything else is optional over there, and a receptor with an address reads like a
				// real customer on the CFDI instead of a row somebody automated into existence.
				...(datos.email ? { email: datos.email } : {}),
				...(datos.calle ? { calle: datos.calle } : {}),
				...(datos.numero ? { numero_exterior: datos.numero } : {}),
				...(datos.colonia ? { colonia: datos.colonia } : {}),
				...(datos.ciudad ? { ciudad: datos.ciudad } : {}),
				...(datos.estado ? { estado: datos.estado } : {}),
				pais: "MX",
			}),
		});

		const uid = uidDeCliente(creado);
		if (!uid) {
			console.error(
				"[factura.com] alta de cliente sin UID en la respuesta",
				JSON.stringify(creado).slice(0, 500),
			);
			throw new ClienteError(502, "El proveedor no devolvió el identificador del cliente.");
		}
		return uid;
	},

	async obtenerReceptor(cfg, rfc) {
		const encontrado = await intentar(cfg, RUTAS.clientePorRfc(rfc));
		if (!encontrado || !exito(encontrado)) return null;
		return receptorDeCliente(encontrado);
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
