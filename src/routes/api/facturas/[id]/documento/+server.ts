import { error, type RequestHandler } from "@sveltejs/kit";
import { ClienteError } from "$lib/server/clientes";
import { documentoDeFactura } from "$lib/server/timbrado";
import { requireUser } from "$lib/server/guard";

/**
 * GET /api/facturas/[id]/documento?formato=pdf|xml — the stamped CFDI. Permission: `factura:read`.
 *
 * Streamed straight from the PAC, never stored: the XML is the SAT's document and re-deriving or
 * re-hosting it is how a shop ends up serving a stale copy of something that was cancelled. This
 * is the same reasoning as storing R2 keys instead of signed URLs.
 *
 * `no-store` because the URL is stable and the document behind it is not: an invoice cancelled
 * this afternoon must not be served from a cache this evening.
 */
export const GET: RequestHandler = async ({ locals, params, url, setHeaders }) => {
	const actor = requireUser(locals);
	const formato = url.searchParams.get("formato") === "xml" ? "xml" : "pdf";

	try {
		const doc = await documentoDeFactura({ actor, id: params.id!, formato });
		setHeaders({ "cache-control": "private, no-store" });
		// `Buffer` and not the raw `Uint8Array`: `BodyInit` does not accept the latter in this TS lib.
		return new Response(Buffer.from(doc.contenido), {
			headers: {
				"content-type": doc.contentType,
				// `inline` so a PDF opens in the tab; the XML downloads because nothing renders it.
				"content-disposition": `${formato === "pdf" ? "inline" : "attachment"}; filename="${doc.nombre}"`,
			},
		});
	} catch (err) {
		if (err instanceof ClienteError) error(err.status, err.message);
		throw err;
	}
};
