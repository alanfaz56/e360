/**
 * Which email provider is active, and its credentials — same shape as `pac/index.ts`.
 *
 * **Fails closed for the caller, degrades for the app.** `proveedorActivo()` throws a 503 naming
 * the missing credential, same as the PAC; but every SENDING function here (`enviarCorreoCliente`,
 * `enviarInvitacion`, `enviarRestablecerPassword`) catches that and every other failure itself —
 * an email is a courtesy on top of the in-app inbox and Web Push, never a gate. Same posture as
 * `enviarPush`: no VAPID keys configured still leaves a fully working notification centre.
 */
import { env } from "$env/dynamic/private";
import prisma from "$lib/prisma";
import { valoresAjuste } from "../ajustes";
import { ClienteError } from "../clientes";
import { resend } from "./resend";
import { avisoCliente, bloqueCuentaBancaria, invitacion, restablecerPassword } from "./plantillas";
import { cuentaBancariaPrincipal } from "../cuentas-bancarias";
import type { ConfigCorreo, ProveedorCorreo } from "./tipos";

export type { ConfigCorreo, EnvioCorreo, ProveedorCorreo, ResultadoEnvio } from "./tipos";

export const PROVEEDORES: Record<string, ProveedorCorreo> = {
	[resend.clave]: resend,
};

export const PROVEEDOR_DEFAULT = resend.clave;

/** The active provider and its config, or a 503 naming exactly which piece is missing. */
export async function proveedorActivo(): Promise<{ proveedor: ProveedorCorreo; cfg: ConfigCorreo }> {
	const ajustes = await valoresAjuste(["correo.apiKey", "correo.remitente"]);

	const proveedor = PROVEEDORES[PROVEEDOR_DEFAULT];
	if (!proveedor) throw new ClienteError(503, "No hay proveedor de correo configurado.");

	const faltan = [
		["la API key", ajustes["correo.apiKey"]],
		["el remitente", ajustes["correo.remitente"]],
	]
		.filter(([, v]) => !v)
		.map(([nombre]) => nombre);

	if (faltan.length > 0) {
		throw new ClienteError(503, `Correo sin configurar: falta ${faltan.join(", ")}. Captúralo en Ajustes.`);
	}

	return { proveedor, cfg: { apiKey: ajustes["correo.apiKey"], remitente: ajustes["correo.remitente"] } };
}

/** Absolute site URL. `BETTER_AUTH_URL` is already the app's own canonical origin. */
const absoluta = (ruta: string) => new URL(ruta, env.BETTER_AUTH_URL).toString();

/** The mark, absolute — see `plantillas.ts`'s header comment for why it can't stay relative here. */
const logoUrl = () => absoluta("/logo_simple_red.png");

/**
 * The four `cliente_*` events marked `correoCliente` in NOTIFICACION_EVENTOS. Called from inside
 * `notificar()`, right after `enviarPush` — same input shape, same "never throws" contract.
 *
 * Best-effort per recipient: one bad email address must not stop the others in the (rare) case
 * this is ever called with more than one id.
 */
export async function enviarCorreoCliente(
	clienteIds: string[],
	aviso: { evento?: string; titulo: string; cuerpo: string; url: string | null },
): Promise<void> {
	if (clienteIds.length === 0) return;

	const clientes = await prisma.cliente.findMany({
		where: { id: { in: clienteIds }, email: { not: null } },
		select: { email: true },
	});
	if (clientes.length === 0) return;

	try {
		const { proveedor, cfg } = await proveedorActivo();

		// The one deliberate exception to "one generic template" (see `avisoCliente`'s doc comment):
		// a quote or an invoice email tells the customer how to pay for it. Fetched here rather
		// than baked into the caller so `cambiarEstadoCotizacion`/`crearFactura` never hardcode
		// banking info — the catalogue at /panel/cuentas-bancarias is the only place it's typed in.
		const cuenta =
			aviso.evento === "cliente_cotizacion" || aviso.evento === "cliente_factura"
				? await cuentaBancariaPrincipal()
				: null;

		const plantilla = avisoCliente({
			titulo: aviso.titulo,
			cuerpo: aviso.cuerpo,
			url: aviso.url ? absoluta(aviso.url) : null,
			extra: cuenta ? bloqueCuentaBancaria(cuenta) : null,
			logoUrl: logoUrl(),
		});

		for (const { email } of clientes) {
			if (!email) continue;
			try {
				await proveedor.enviar(cfg, { para: email, ...plantilla });
			} catch (err) {
				console.error(`[correo] no se pudo mandar a ${email}:`, err);
			}
		}
	} catch (err) {
		// Sin credenciales configuradas, `proveedorActivo` truena un 503 — se loguea y se sigue,
		// el in-app y el push de `notificar()` ya se escribieron.
		console.error("[correo] enviarCorreoCliente falló:", err);
	}
}

/**
 * The account invitation link, by email. Never throws — the invitation itself already exists and
 * its raw link is returned to the caller regardless, exactly as before this existed.
 */
export async function enviarInvitacion(input: {
	email: string;
	invitadorNombre: string;
	rolLabel: string;
	url: string;
}): Promise<boolean> {
	try {
		const { proveedor, cfg } = await proveedorActivo();
		const plantilla = invitacion({ ...input, logoUrl: logoUrl() });
		await proveedor.enviar(cfg, { para: input.email, ...plantilla });
		return true;
	} catch (err) {
		console.error(`[correo] invitación a ${input.email} no se pudo mandar:`, err);
		return false;
	}
}

/** better-auth's `sendResetPassword` hook calls this. Swallows everything — see file header. */
export async function enviarRestablecerPassword(input: { email: string; nombre: string; url: string }): Promise<void> {
	try {
		const { proveedor, cfg } = await proveedorActivo();
		const plantilla = restablecerPassword({ ...input, logoUrl: logoUrl() });
		await proveedor.enviar(cfg, { para: input.email, ...plantilla });
	} catch (err) {
		console.error(`[correo] restablecer contraseña a ${input.email} no se pudo mandar:`, err);
	}
}
