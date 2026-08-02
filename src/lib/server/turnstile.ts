import { env } from "$env/dynamic/private";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare Turnstile. One fetch, no dependency — the API is a form POST that answers
 * `{ success, "error-codes": [] }`.
 *
 * There is deliberately NO development bypass. `.env.example` ships Cloudflare's documented
 * always-pass test keys instead, so local development exercises this exact code path. A
 * `SKIP_TURNSTILE` flag is the kind of thing that eventually ships enabled.
 */
export type TurnstileResult = { ok: true } | { ok: false; status: number; message: string };

export const turnstileSiteKey = () => env.TURNSTILE_SITE_KEY ?? "";

export async function verifyTurnstile(token: unknown, ip?: string | null): Promise<TurnstileResult> {
	const secret = env.TURNSTILE_SECRET_KEY;
	if (!secret) {
		// Fail closed. An unconfigured environment must never mean "let everyone through".
		return {
			ok: false,
			status: 503,
			message: "El agendado en línea no está disponible por ahora. Llámanos y con gusto te agendamos.",
		};
	}

	const rechazo = {
		ok: false as const,
		status: 400,
		message: "No pudimos verificar que eres una persona. Vuelve a intentarlo.",
	};

	if (typeof token !== "string" || token === "") return rechazo;

	const body = new URLSearchParams({ secret, response: token });
	// Cloudflare scores the request better with the caller's IP. Nothing else about the visitor
	// is sent, and neither the token nor the secret is ever stored or logged.
	if (ip) body.set("remoteip", ip);

	try {
		const res = await fetch(VERIFY_URL, { method: "POST", body });
		const data = (await res.json()) as { success?: boolean };
		return data.success ? { ok: true } : rechazo;
	} catch {
		// Cloudflare unreachable. Still fail closed, but say something a customer can act on.
		return {
			ok: false,
			status: 503,
			message: "No pudimos completar la verificación. Inténtalo de nuevo en un momento.",
		};
	}
}
