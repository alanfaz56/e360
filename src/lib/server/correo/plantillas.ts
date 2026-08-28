/**
 * Email bodies, built from the same words the in-app inbox and push notification already show.
 *
 * `avisoCliente` is ONE template reused for every `cliente_*` event, not four bespoke ones — the
 * `titulo`/`cuerpo` are exactly what `notificar()` already wrote to the inbox. A second copy of
 * the same sentence, hand-tuned per event, is how the email and the in-app text quietly drift.
 *
 * Plain, table-free HTML — this is a shop, not a marketing team, and Rule 7 already says no new
 * dependency for what a few lines of markup covers.
 *
 * No `$env` import here on purpose: this file stays plain enough for `scripts/check-correo.ts` to
 * exercise directly under tsx, the same discipline `prisma/seed.ts` follows for `$lib`/`$env`.
 * `index.ts` (which already has `env` and builds `absoluta()`) passes the logo's URL in instead.
 */

/**
 * The mark, not the name — same rule `Logo.svelte` follows for the panel and the printables.
 *
 * `logoUrl` defaults to the relative path: fine for `scripts/check-correo.ts`, which only reads
 * the HTML string and never actually opens it in a mail client. A real send needs the ABSOLUTE
 * one instead — a mail client renders this from wherever it opens, never from this app's own
 * origin — so `enviarCorreoCliente`/`enviarInvitacion`/`enviarRestablecerPassword` in `index.ts`
 * pass `absoluta("/logo_simple_red.png")` through every exported function below.
 */
const LOGO_RELATIVA = "/logo_simple_red.png";

const envoltura = (cuerpoHtml: string, logoUrl: string = LOGO_RELATIVA) => `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f5f3ef;font-family:system-ui,sans-serif;color:#1c1917;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;">
<img src="${logoUrl}" alt="Estación 360" height="28" style="display:block;height:28px;width:auto;margin:0 0 16px;">
${cuerpoHtml}
</div>
</body></html>`;

const boton = (texto: string, url: string) =>
	`<a href="${url}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#1c1917;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">${texto}</a>`;

/**
 * Every `cliente_*` event in NOTIFICACION_EVENTOS, sent as-is — see the file header.
 * `url`, when given, is already absolute — the caller resolves it against the site's own origin.
 *
 * `extra` is the one deliberate exception to "one generic template": today it carries the bank
 * transfer block on a cotización email, and only that call site ever sets it — see
 * `enviarCorreoCliente`. Appended after the button, its own small block, never woven into `cuerpo`
 * itself so the two stay visibly separate: what happened, and how to pay for it.
 */
export function avisoCliente(input: {
	titulo: string;
	cuerpo: string;
	url: string | null;
	extra?: { html: string; texto: string } | null;
	logoUrl?: string;
}) {
	return {
		asunto: input.titulo,
		html: envoltura(
			`<h1 style="margin:0 0 12px;font-size:18px;">${input.titulo}</h1>
<p style="margin:0;font-size:14px;line-height:1.5;color:#44403c;">${input.cuerpo}</p>
${input.url ? boton("Ver seguimiento", input.url) : ""}
${input.extra?.html ?? ""}`,
			input.logoUrl,
		),
		texto: `${input.titulo}\n\n${input.cuerpo}${input.url ? `\n\n${input.url}` : ""}${input.extra?.texto ? `\n\n${input.extra.texto}` : ""}`,
	};
}

/** The bank-transfer block for a cotización email. Only account info a customer needs to pay. */
export function bloqueCuentaBancaria(cuenta: { banco: string; titular: string; clabe: string | null; numeroCuenta: string | null }) {
	const filas = [
		["Banco", cuenta.banco],
		["Titular", cuenta.titular],
		...(cuenta.clabe ? [["CLABE", cuenta.clabe]] : []),
		...(cuenta.numeroCuenta ? [["Cuenta", cuenta.numeroCuenta]] : []),
	];
	return {
		html: `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e7e5e4;">
<p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1c1917;">Para transferir el pago</p>
${filas.map(([k, v]) => `<p style="margin:0;font-size:13px;color:#44403c;"><strong>${k}:</strong> ${v}</p>`).join("\n")}
</div>`,
		texto: `Para transferir el pago:\n${filas.map(([k, v]) => `${k}: ${v}`).join("\n")}`,
	};
}

export function invitacion(input: { invitadorNombre: string; rolLabel: string; url: string; logoUrl?: string }) {
	const asunto = `${input.invitadorNombre} te invitó a Estación 360`;
	return {
		asunto,
		html: envoltura(
			`<h1 style="margin:0 0 12px;font-size:18px;">Te invitaron a Estación 360</h1>
<p style="margin:0;font-size:14px;line-height:1.5;color:#44403c;">
${input.invitadorNombre} te invitó como <strong>${input.rolLabel}</strong>. El link vence en 72 horas.</p>
${boton("Aceptar invitación", input.url)}`,
			input.logoUrl,
		),
		texto: `${input.invitadorNombre} te invitó a Estación 360 como ${input.rolLabel}.\n\nAceptar: ${input.url}\n\nEl link vence en 72 horas.`,
	};
}

export function restablecerPassword(input: { nombre: string; url: string; logoUrl?: string }) {
	const asunto = "Restablecer tu contraseña — Estación 360";
	return {
		asunto,
		html: envoltura(
			`<h1 style="margin:0 0 12px;font-size:18px;">Restablecer tu contraseña</h1>
<p style="margin:0;font-size:14px;line-height:1.5;color:#44403c;">
Hola ${input.nombre}. Pediste restablecer tu contraseña. Si no fuiste tú, ignora este correo.</p>
${boton("Restablecer contraseña", input.url)}`,
			input.logoUrl,
		),
		texto: `Hola ${input.nombre}. Pediste restablecer tu contraseña.\n\n${input.url}\n\nSi no fuiste tú, ignora este correo.`,
	};
}
