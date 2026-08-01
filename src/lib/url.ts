/**
 * Build a href that is the current URL with some search params set or cleared (`null`),
 * leaving every other param untouched.
 *
 * All open/closed UI state in the panel (drawers, the mobile menu) lives in the URL rather
 * than in component state, so every one of those toggles is this same operation.
 */
export function searchHref(current: URL, params: Record<string, string | null>): string {
	const next = new URL(current);
	for (const [key, value] of Object.entries(params)) {
		if (value === null) next.searchParams.delete(key);
		else next.searchParams.set(key, value);
	}
	return next.pathname + next.search;
}
