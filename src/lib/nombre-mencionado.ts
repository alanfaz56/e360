const GENERICAS = new Set([
	"taller",
	"talleres",
	"de",
	"del",
	"la",
	"el",
	"los",
	"las",
	"y",
	"e",
	"sa",
	"cv",
	"srl",
	"auto",
	"autos",
	"servicio",
	"servicios",
	"hermosillo",
]);

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Word-boundary match only — plain `.includes` on a name/word also matches as a substring of an
// unrelated longer word (e.g. "humo" sits inside no taller name, but shorter/common fragments did
// false-positive this way), so both the full name and each distinctive word are matched with `\b`
// boundaries instead.
const contieneComoPalabra = (texto: string, buscado: string) =>
	new RegExp(`\\b${escapeRegExp(buscado)}\\b`, "u").test(texto);

/**
 * Pure matcher behind `tallerMencionado` (src/lib/server/talleres.ts) — does `texto` name any of
 * `nombres`? Split out into its own dependency-free module so it can be unit-tested without a
 * database or SvelteKit's `$env`.
 *
 * Deliberately simple: normalize accents and case, then look for each name and its distinctive
 * words. It is a guard against the honest slip, not against somebody determined to leak the name
 * — that is a people problem, not a regex problem. Short/common words are skipped so "Taller" or
 * "del" never trips it.
 */
export function nombreMencionado(texto: string, nombres: string[]): string | null {
	if (nombres.length === 0) return null;
	const cuerpo = normalizar(texto);

	// NOTE: length>=5-and-not-generic is a heuristic, not a full stopword list. A taller name
	// built from common industry/location words (e.g. "Centro", "Norte", "Automotriz") can
	// false-positive on an ordinary comment using that same word for unrelated reasons. If a
	// real name collides this way, add its generic word to GENERICAS rather than reworking the
	// algorithm — that keeps the guard's failure mode false-negative (a slip goes unflagged),
	// which the docstring already accepts, instead of false-positive (blocking a clean comment).
	for (const nombre of nombres) {
		const completo = normalizar(nombre);
		if (contieneComoPalabra(cuerpo, completo)) return nombre;
		// A distinctive word is enough: "El Sahuaro" is recognisable from "Sahuaro" alone.
		// Split on punctuation too, not just whitespace — "Ruiz-Hernández" must still yield
		// "ruiz" and "hernandez" as separate distinctive words, not one hyphenated token that
		// never matches unless the comment repeats the hyphen.
		for (const palabra of completo.split(/[\s\-.,]+/)) {
			if (palabra.length >= 5 && !GENERICAS.has(palabra) && contieneComoPalabra(cuerpo, palabra)) return nombre;
		}
	}
	return null;
}
