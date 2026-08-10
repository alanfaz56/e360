/**
 * Email bodies, built from the same words the in-app inbox and push notification already show.
 *
 * `avisoCliente` is ONE template reused for every `cliente_*` event, not four bespoke ones — the
 * `titulo`/`cuerpo` are exactly what `notificar()` already wrote to the inbox. A second copy of
 * the same sentence, hand-tuned per event, is how the email and the in-app text quietly drift.
 *
 * Plain, table-free HTML — this is a shop, not a marketing team, and Rule 7 already says no new
 * dependency for what a few lines of markup covers.
 */

const envoltura = (cuerpoHtml: string) => `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f5f3ef;font-family:system-ui,sans-serif;color:#1c1917;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;">
<p style="margin:0 0 16px;font-size:13px;font-weight:700;letter-spacing:.02em;color:#78716c;">ESTACIÓN 360</p>
${cuerpoHtml}
</div>
</body></html>`;

const boton = (texto: string, url: string) =>
	`<a href="${url}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#1c1917;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">${texto}</a>`;

/**
 * Every `cliente_*` event in NOTIFICACION_EVENTOS, sent as-is — see the file header.
 * `url`, when given, is already absolute — the caller resolves it against the site's own origin.
 */
export function avisoCliente(input: { titulo: string; cuerpo: string; url: string | null }) {
	return {
		asunto: input.titulo,
		html: envoltura(
			`<h1 style="margin:0 0 12px;font-size:18px;">${input.titulo}</h1>
<p style="margin:0;font-size:14px;line-height:1.5;color:#44403c;">${input.cuerpo}</p>
${input.url ? boton("Ver seguimiento", input.url) : ""}`,
		),
		texto: `${input.titulo}\n\n${input.cuerpo}${input.url ? `\n\n${input.url}` : ""}`,
	};
}

export function invitacion(input: { invitadorNombre: string; rolLabel: string; url: string }) {
	const asunto = `${input.invitadorNombre} te invitó a Estación 360`;
	return {
		asunto,
		html: envoltura(
			`<h1 style="margin:0 0 12px;font-size:18px;">Te invitaron a Estación 360</h1>
<p style="margin:0;font-size:14px;line-height:1.5;color:#44403c;">
${input.invitadorNombre} te invitó como <strong>${input.rolLabel}</strong>. El link vence en 72 horas.</p>
${boton("Aceptar invitación", input.url)}`,
		),
		texto: `${input.invitadorNombre} te invitó a Estación 360 como ${input.rolLabel}.\n\nAceptar: ${input.url}\n\nEl link vence en 72 horas.`,
	};
}

export function restablecerPassword(input: { nombre: string; url: string }) {
	const asunto = "Restablecer tu contraseña — Estación 360";
	return {
		asunto,
		html: envoltura(
			`<h1 style="margin:0 0 12px;font-size:18px;">Restablecer tu contraseña</h1>
<p style="margin:0;font-size:14px;line-height:1.5;color:#44403c;">
Hola ${input.nombre}. Pediste restablecer tu contraseña. Si no fuiste tú, ignora este correo.</p>
${boton("Restablecer contraseña", input.url)}`,
		),
		texto: `Hola ${input.nombre}. Pediste restablecer tu contraseña.\n\n${input.url}\n\nSi no fuiste tú, ignora este correo.`,
	};
}
