/**
 * One submit per form, per navigation.
 *
 * Every write in this app is a real `<form method="POST">` that redirects on success, so the only
 * thing standing between a double-tap and a duplicate row is how fast the server answers. On a
 * phone in the bay, over the shop's wifi, that is not fast: the button appears dead, so it gets
 * tapped again — and two identical citas land 250 ms apart. That is exactly what happened.
 *
 * Fixing it per form would mean remembering it on every form forever. This is ONE capture-phase
 * listener on the document, so it covers the panel, the public booking form and anything added
 * later without them opting in.
 *
 * It is a courtesy, not a control: with JavaScript off a double submit still gets through, which
 * is why the operations that genuinely cannot happen twice defend themselves in the database
 * (`cita_id` unique on a nota, one open nota per unit, one open transfer per nota). This closes
 * the case those constraints cannot see — two rows that are legitimately allowed to both exist.
 */

const enVuelo = new WeakSet<HTMLFormElement>();

/** Give the browser its tick to serialize the form before anything gets disabled. */
function bloquearBotones(form: HTMLFormElement) {
	setTimeout(() => {
		for (const el of form.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
			'button:not([type="button"]), input[type="submit"]',
		)) {
			// Disabling BEFORE the browser has serialized the form drops the button's own
			// name/value from the payload and, in some browsers, cancels the submit outright.
			el.disabled = true;
			el.setAttribute("aria-busy", "true");
		}
	}, 0);
}

/**
 * Install the guard. Returns the teardown so a `$effect` can hand it back.
 *
 * `capture: true` so this runs before SvelteKit's `enhance` handler and before any per-form
 * listener — preventing the event here stops all of them.
 */
export function unSoloEnvio(): () => void {
	const alEnviar = (evento: Event) => {
		const form = evento.target;
		if (!(form instanceof HTMLFormElement)) return;
		// A GET form is a filter or a search: submitting it twice costs nothing and blocking the
		// second one would strand somebody who edited the query and pressed enter again.
		if ((form.method || "get").toLowerCase() !== "post") return;

		if (enVuelo.has(form)) {
			evento.preventDefault();
			evento.stopImmediatePropagation();
			return;
		}
		enVuelo.add(form);
		bloquearBotones(form);
	};

	document.addEventListener("submit", alEnviar, true);
	return () => document.removeEventListener("submit", alEnviar, true);
}

/**
 * Release every form after a navigation.
 *
 * A successful action redirects, so the page is replaced and its forms with it. But a FAILED
 * action re-renders the same page — with SvelteKit reusing the same DOM nodes — and a form left
 * marked would be permanently dead. Clearing on navigation is what makes "fix the field and try
 * again" work.
 */
export function liberarFormularios(): void {
	for (const form of document.querySelectorAll("form")) {
		enVuelo.delete(form);
		for (const el of form.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
			'button:not([type="button"]), input[type="submit"]',
		)) {
			el.disabled = false;
			el.removeAttribute("aria-busy");
		}
	}
}
