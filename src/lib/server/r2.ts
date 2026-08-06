import { randomUUID } from "node:crypto";
import { env } from "$env/dynamic/private";
import { firmarUrl } from "$lib/sigv4";

/**
 * Cloudflare R2 uploads, via presigned PUT URLs.
 *
 * The browser uploads STRAIGHT to R2 with a short-lived signed URL; the file never passes through
 * our server. That is not tidiness — on a serverless host the request body limit is a few
 * megabytes and a phone photo is routinely more, so proxying uploads would fail on real hardware.
 *
 * The signing itself is in src/lib/sigv4.ts, kept free of `$env` so the self-check can pin it to
 * AWS's published test vector. This file is only the configuration and the key policy.
 *
 * Fails CLOSED: with no keys configured, nothing signs and nothing uploads.
 */

const REGION = "auto"; // R2 always uses "auto"
const SERVICE = "s3";

export type R2Config = {
	accountId: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	/** Public base URL for reading, e.g. an r2.dev domain or a custom one. */
	publicBaseUrl: string | null;
};

/**
 * Env names: `CLOUDFLARE_*` is what the project uses; the `R2_*` spellings are accepted as an
 * alias so a bucket configured either way keeps working. Deliberately not two features — one
 * config, two spellings, resolved here and nowhere else.
 */
export function r2Config(): R2Config | null {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? env.R2_ACCOUNT_ID;
	const bucket = env.CLOUDFLARE_STORAGEBUCKET ?? env.R2_BUCKET;
	const accessKeyId = env.CLOUDFLARE_ACCESS_KEY_ID ?? env.R2_ACCESS_KEY_ID;
	const secretAccessKey = env.CLOUDFLARE_SECRET_ACCESS_KEY ?? env.R2_SECRET_ACCESS_KEY;
	if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;
	return {
		accountId,
		bucket,
		accessKeyId,
		secretAccessKey,
		publicBaseUrl: (env.STORAGE_PUBLIC_URL ?? env.R2_PUBLIC_BASE_URL)?.replace(/\/$/, "") ?? null,
	};
}

export const r2Configurado = () => r2Config() !== null;

const host = (cfg: R2Config) => `${cfg.accountId}.r2.cloudflarestorage.com`;

const firmar = (cfg: R2Config, metodo: string, clave: string, expiraSegundos: number) =>
	firmarUrl({
		metodo,
		host: host(cfg),
		ruta: `/${cfg.bucket}/${clave}`,
		accessKeyId: cfg.accessKeyId,
		secretAccessKey: cfg.secretAccessKey,
		region: REGION,
		service: SERVICE,
		expiraSegundos,
	});

export type SubidaFirmada = { clave: string; url: string; expiraEn: number };

/**
 * Sign one upload.
 *
 * The KEY is generated HERE and never taken from the client. A caller-chosen key could overwrite
 * another note's evidence or escape the prefix entirely; a generated one carries the note id, so
 * every object is traceable back to the job it documents.
 */
export function firmarSubida(input: {
	notaId: string;
	nombreOriginal: string;
	expiraSegundos?: number;
}): SubidaFirmada | null {
	const cfg = r2Config();
	if (!cfg) return null;

	const extension = (input.nombreOriginal.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? "").toLowerCase();
	const clave = `notas/${input.notaId}/${Date.now()}-${randomUUID()}${extension}`;
	const expiraSegundos = input.expiraSegundos ?? 600;

	return { clave, expiraEn: expiraSegundos, url: firmar(cfg, "PUT", clave, expiraSegundos) };
}

/**
 * Where the object can be read.
 *
 * With a public bucket domain configured this is a plain URL. Without one, a short-lived signed
 * GET — so a private bucket still works, just with links that expire.
 */
export function urlDeLectura(clave: string, expiraSegundos = 3600): string | null {
	const cfg = r2Config();
	if (!cfg) return null;
	if (cfg.publicBaseUrl) return `${cfg.publicBaseUrl}/${clave.split("/").map(encodeURIComponent).join("/")}`;
	return firmar(cfg, "GET", clave, expiraSegundos);
}

/** Best-effort delete. R2 being unreachable must not stop the row from being removed. */
export async function borrarObjeto(clave: string): Promise<boolean> {
	const cfg = r2Config();
	if (!cfg) return false;
	try {
		const res = await fetch(firmar(cfg, "DELETE", clave, 60), { method: "DELETE" });
		return res.ok || res.status === 404;
	} catch {
		return false;
	}
}
