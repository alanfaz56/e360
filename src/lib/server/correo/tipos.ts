/**
 * The port every email provider plugs into.
 *
 * A mail provider is a vendor decision, not an architectural one — Resend, Postmark and SendGrid
 * all deliver the same RFC 5322 message. Same shape as `$lib/server/pac/tipos.ts`: a plain object
 * of functions, not a class hierarchy. Adding a second provider is one file plus one registry line.
 *
 * Rules an adapter must keep:
 *
 * - **Missing credentials → `ClienteError(503)`.** Never a silent no-op, never a fake success.
 * - **Never return the provider's raw payload.** `ResultadoEnvio` is the whole contract.
 */

export type ConfigCorreo = {
	apiKey: string;
	remitente: string;
};

export type EnvioCorreo = {
	para: string;
	asunto: string;
	html: string;
	texto: string;
};

export type ResultadoEnvio = {
	/** The provider's own message id, for support tickets — never surfaced to a customer. */
	id: string;
};

export type ProveedorCorreo = {
	/** Stable id. Never translated for display. */
	readonly clave: string;
	readonly label: string;

	enviar(cfg: ConfigCorreo, envio: EnvioCorreo): Promise<ResultadoEnvio>;
};
