/**
 * Pagination shared by every list endpoint.
 *
 * Extracted once the audit trail stopped being the only paginated list — clientes,
 * unidades and contactos all need the same skip/take/total dance, and four copies of it
 * is four places to get the off-by-one wrong (CLAUDE.md Rule 5).
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type PageParams = { page: number; perPage: number };

/** Read `page` / `perPage` from a query string, clamped and never NaN. */
export function parsePageParams(
	params: URLSearchParams,
	defaultPerPage = DEFAULT_PAGE_SIZE,
): PageParams {
	const int = (raw: string | null, fallback: number) => {
		const n = Number(raw);
		return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
	};
	return {
		page: int(params.get("page"), 1),
		perPage: Math.min(int(params.get("perPage"), defaultPerPage), MAX_PAGE_SIZE),
	};
}

export const skipFor = ({ page, perPage }: PageParams) => (page - 1) * perPage;

/** The paging envelope every list endpoint returns alongside its rows. */
export function pageMeta(total: number, { page, perPage }: PageParams) {
	return { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

/**
 * A valid Date, or undefined. Keeps a typo'd date from silently filtering everything out.
 * `endOfDay` turns a bare `2026-08-31` into the last millisecond of that day.
 */
export function parseDate(value: string | null | undefined, endOfDay = false): Date | undefined {
	if (!value) return undefined;
	const date = new Date(endOfDay && value.length === 10 ? `${value}T23:59:59.999` : value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}
