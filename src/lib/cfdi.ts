/**
 * Reading a supplier's CFDI.
 *
 * Pure: no I/O, no `$env`, no database — the same split as `sigv4.ts` vs `server/r2.ts` and
 * `webpush.ts` vs `server/push.ts`. That is what lets `scripts/check-inventario.ts` pin it under
 * tsx, which matters because this parses a document that arrives from outside.
 */

/**
 * Pull the header out of a supplier's CFDI 4.0 XML.
 *
 * Deliberately a few regexes over the four attributes we actually use, not an XML parser: adding
 * one to read a UUID, an RFC, a total and a date is a dependency and a parse surface for a
 * document that arrives from outside. **The raw XML is stored verbatim regardless** — the stamped
 * document is what the SAT and the supplier both recognise, and re-deriving it from columns is
 * impossible.
 *
 * Returns null for anything that does not look like a CFDI rather than throwing, because a
 * receipt with a bad or missing XML is still a receipt. The parse is a convenience, not a gate.
 *
 * ponytail: regex over the attributes we need. If invoice capture ever has to reconcile line items
 * against the receipt, that is the point to bring in a real XML parser.
 */
export function leerCfdi(xml: string): {
	uuid: string | null;
	emisorRfc: string | null;
	emisorNombre: string | null;
	total: number | null;
	fecha: Date | null;
} | null {
	if (typeof xml !== "string" || !/<[^>]*Comprobante/i.test(xml)) return null;

	const attr = (re: RegExp) => re.exec(xml)?.[1] ?? null;
	const uuid = attr(/UUID\s*=\s*"([0-9A-Fa-f-]{36})"/);
	const emisorRfc = attr(/<[^>]*Emisor[^>]*\bRfc\s*=\s*"([^"]+)"/);
	const emisorNombre = attr(/<[^>]*Emisor[^>]*\bNombre\s*=\s*"([^"]+)"/);
	const totalRaw = attr(/<[^>]*Comprobante[^>]*\bTotal\s*=\s*"([\d.]+)"/);
	const fechaRaw = attr(/<[^>]*Comprobante[^>]*\bFecha\s*=\s*"([^"]+)"/);

	const total = totalRaw !== null && Number.isFinite(Number(totalRaw)) ? Number(totalRaw) : null;
	const fecha = fechaRaw ? new Date(fechaRaw) : null;

	return {
		uuid: uuid?.toUpperCase() ?? null,
		emisorRfc: emisorRfc?.toUpperCase() ?? null,
		emisorNombre,
		total,
		fecha: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null,
	};
}
