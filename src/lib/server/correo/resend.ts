/**
 * Resend, behind the `ProveedorCorreo` port.
 *
 * Their API is a plain JSON HTTP API — one endpoint, one POST — so this is `fetch` and nothing
 * else. No SDK, same reasoning as `sigv4.ts`/`webpush.ts`/`pac/factura-com.ts`: a dependency for
 * one endpoint is a dependency to keep up to date.
 */
import { ClienteError } from "../clientes";
import type { ConfigCorreo, EnvioCorreo, ProveedorCorreo, ResultadoEnvio } from "./tipos";

const ENDPOINT = "https://api.resend.com/emails";

async function enviar(cfg: ConfigCorreo, envio: EnvioCorreo): Promise<ResultadoEnvio> {
	const res = await fetch(ENDPOINT, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${cfg.apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: cfg.remitente,
			to: [envio.para],
			subject: envio.asunto,
			html: envio.html,
			text: envio.texto,
		}),
	});

	const cuerpo = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;

	if (!res.ok) {
		// Resend's validation errors name the field the caller has to fix ("Invalid `from` field").
		// Anything else — an outage, a bad key — is not something to show whoever triggered the
		// send, so it becomes a reference in the log instead.
		if (res.status >= 400 && res.status < 500 && cuerpo?.message) {
			throw new ClienteError(502, `Resend rechazó el correo: ${cuerpo.message}`);
		}
		console.error("[resend] envío falló", res.status, cuerpo);
		throw new ClienteError(502, "No se pudo mandar el correo.");
	}

	return { id: cuerpo?.id ?? "" };
}

export const resend: ProveedorCorreo = {
	clave: "resend",
	label: "Resend",
	enviar,
};
