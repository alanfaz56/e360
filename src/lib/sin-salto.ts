/**
 * Keep scroll position across a form action's redirect.
 *
 * Every write in this app is a real `<form method="POST">` that redirects on success (see
 * `una-vez.ts`) — that is what a plain form does, JS or not, and it's what makes the double-submit
 * guard and the flash-message-in-the-URL pattern (`$lib/flash.ts`) work with no JavaScript at all.
 * The cost is that a redirect is, to the browser, a brand-new navigation: scroll resets to the top
 * even though the user is looking at the exact page they were just on, one comment or one status
 * further along.
 *
 * `data-sveltekit-noscroll` does NOT fix this: SvelteKit's router only intercepts GET forms
 * client-side (see `container.addEventListener('submit', ...)` in its client runtime) — a POST
 * always does a native browser submit, which the router never sees and so never applies `noscroll`
 * to. And `use:enhance` on its own does not fix it either: its default `applyAction` calls
 * `goto(location, { invalidateAll: true })` for a redirect result WITHOUT `noScroll`, so scroll
 * still resets even with JS intercepting the submit.
 *
 * This is the actual fix: a `use:enhance` submit callback that, on a redirect result, calls
 * `goto` itself with `noScroll: true` instead of letting the default handler do it. Every other
 * result (`success`, `failure`, `error`) still goes through the real `applyAction`, so `form`,
 * validation errors and the error page all behave exactly as SvelteKit already documents.
 *
 * Usage: `<form method="POST" use:enhance={sinSaltoAlRedirigir}>` — no config, one line per form.
 *
 * A form that needs to clear itself on success (a comment box, say — the DOM `reset()` `enhance`
 * would otherwise call does nothing to a Svelte-bound `$state` value, and this callback replaces
 * that default entirely) can pass a callback: `use:enhance={sinSaltoAlRedirigir(() => texto = "")}`.
 * It only runs once the redirect actually happens, i.e. once the server accepted the write.
 */

import type { SubmitFunction } from "@sveltejs/kit";
import { applyAction } from "$app/forms";
import { goto } from "$app/navigation";

export const sinSaltoAlRedirigir =
	(alExito?: () => void): SubmitFunction =>
	() =>
	async ({ result }) => {
		if (result.type === "redirect") {
			// Same `invalidateAll: true` the default `applyAction` passes to its own `goto` call for
			// a redirect — a write just happened, every `load` on the target must re-run, not serve
			// what was cached before the write. Only `noScroll` is the addition.
			await goto(result.location, { invalidateAll: true, noScroll: true });
			alExito?.();
			return;
		}
		await applyAction(result);
	};
