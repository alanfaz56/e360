import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature V4, presigned-URL flavour. Pure: no environment, no I/O, no configuration.
 *
 * Lives outside `src/lib/server/` on purpose — it reads nothing secret, and keeping it free of
 * `$env` is what lets `scripts/check-r2.ts` import it under tsx and pin it to AWS's published
 * test vector. Hand-rolled crypto is only defensible when something else checks the answer.
 *
 * Cloudflare R2 speaks the S3 API, so this signs for R2 too — region is always "auto" there.
 */

export const ALGORITHM = "AWS4-HMAC-SHA256";
/** R2 cannot verify a payload hash on a presigned PUT; this is the documented placeholder. */
export const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/**
 * Percent-encode for SigV4.
 *
 * `encodeURIComponent` leaves `!'()*` alone and AWS does not. Getting this wrong produces a
 * valid-looking URL that is rejected with 403 only for files whose names contain punctuation —
 * which is exactly the kind of bug that ships.
 */
export function encodeRfc3986(value: string, conservarSlash = false): string {
	const encoded = encodeURIComponent(value).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);
	return conservarSlash ? encoded.replace(/%2F/g, "/") : encoded;
}

/** `20260803T064500Z` and `20260803`, the two shapes SigV4 wants. */
export function marcasDeTiempo(now: Date) {
	const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
	return { amzDate: iso, fecha: iso.slice(0, 8) };
}

/** The scoped signing key: HMAC chained through date, region, service and the literal terminator. */
export function firmaDerivada(
	secret: string,
	fecha: string,
	region: string,
	service: string,
): Buffer {
	const kFecha = hmac(`AWS4${secret}`, fecha);
	const kRegion = hmac(kFecha, region);
	const kService = hmac(kRegion, service);
	return hmac(kService, "aws4_request");
}

export type FirmaInput = {
	metodo: string;
	host: string;
	ruta: string;
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
	service: string;
	expiraSegundos: number;
	/** Injectable so the self-check can pin a fixed timestamp. */
	now?: Date;
	consultaExtra?: Record<string, string>;
	payloadHash?: string;
};

/** A presigned URL for one request. */
export function firmarUrl(input: FirmaInput): string {
	const { amzDate, fecha } = marcasDeTiempo(input.now ?? new Date());
	const scope = `${fecha}/${input.region}/${input.service}/aws4_request`;

	const consulta: Record<string, string> = {
		"X-Amz-Algorithm": ALGORITHM,
		"X-Amz-Credential": `${input.accessKeyId}/${scope}`,
		"X-Amz-Date": amzDate,
		"X-Amz-Expires": String(input.expiraSegundos),
		"X-Amz-SignedHeaders": "host",
		...(input.consultaExtra ?? {}),
	};

	// Canonical query: sorted by key, both sides percent-encoded.
	const canonicalQuery = Object.keys(consulta)
		.sort()
		.map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(consulta[k])}`)
		.join("&");

	const canonicalRequest = [
		input.metodo,
		encodeRfc3986(input.ruta, true),
		canonicalQuery,
		`host:${input.host}\n`,
		"host",
		input.payloadHash ?? UNSIGNED_PAYLOAD,
	].join("\n");

	const stringToSign = [ALGORITHM, amzDate, scope, sha256(canonicalRequest)].join("\n");
	const firma = createHmac(
		"sha256",
		firmaDerivada(input.secretAccessKey, fecha, input.region, input.service),
	)
		.update(stringToSign)
		.digest("hex");

	return `https://${input.host}${encodeRfc3986(input.ruta, true)}?${canonicalQuery}&X-Amz-Signature=${firma}`;
}
