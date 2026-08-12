/**
 * Estación 360's own contact info — pure formatting helpers, safe to import from the browser.
 *
 * `telefono` is stored as 10 bare digits (`"6621234567"`), never formatted and never a `tel:`/
 * `wa.me` link — that is what these helpers derive, so the shape stored is the one thing every
 * caller (tel link, WhatsApp link, printed display) agrees on.
 */

/** Keep only digits, capped at 10 — a Mexican phone number has no country code stored. */
export function limpiarTelefono(v: unknown): string | null {
	const digitos = String(v ?? "")
		.replace(/\D/g, "")
		.slice(0, 10);
	return digitos.length === 10 ? digitos : null;
}

/** "6621234567" -> "662 123 4567". Falls back to the raw value if it isn't 10 digits. */
export function telefonoFormato(telefono: string | null | undefined): string | null {
	if (!telefono) return null;
	if (!/^\d{10}$/.test(telefono)) return telefono;
	return `${telefono.slice(0, 3)} ${telefono.slice(3, 6)} ${telefono.slice(6)}`;
}

export function telHref(telefono: string | null | undefined): string | null {
	return telefono ? `tel:+52${telefono}` : null;
}

export function waHref(telefono: string | null | undefined): string | null {
	return telefono ? `https://wa.me/52${telefono}` : null;
}
