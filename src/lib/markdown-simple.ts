/**
 * Minimal renderer for the markdown subset our AI prompts are told to produce
 * (headers, bold, italics, lists, hr, paragraphs). Not a general markdown parser —
 * escapes HTML first so raw model/user text can never inject markup.
 */
function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function inline(s: string): string {
	return escapeHtml(s)
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");
}

export function renderNarrativaMarkdown(texto: string): string {
	const lineas = texto.split("\n");
	const html: string[] = [];
	let enLista = false;

	const cerrarLista = () => {
		if (enLista) {
			html.push("</ul>");
			enLista = false;
		}
	};

	for (const linea of lineas) {
		const l = linea.trim();

		if (l === "") {
			cerrarLista();
			continue;
		}
		if (l === "---") {
			cerrarLista();
			html.push("<hr />");
			continue;
		}
		const encabezado = l.match(/^(#{1,6})\s+(.*)$/);
		if (encabezado) {
			cerrarLista();
			const nivel = encabezado[1].length;
			html.push(`<h${nivel}>${inline(encabezado[2])}</h${nivel}>`);
			continue;
		}
		const item = l.match(/^[*-]\s+(.*)$/);
		if (item) {
			if (!enLista) {
				html.push("<ul>");
				enLista = true;
			}
			html.push(`<li>${inline(item[1])}</li>`);
			continue;
		}
		cerrarLista();
		html.push(`<p>${inline(l)}</p>`);
	}
	cerrarLista();

	return html.join("\n");
}
