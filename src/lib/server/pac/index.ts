/**
 * Which stamping provider is active, and its credentials.
 *
 * The registry is a map, so a second PAC is one file plus one entry. `facturacion.proveedor` is an
 * ordinary setting, which means switching is a dropdown on the settings screen and not a redeploy
 * — the same reason the credentials live in the database at all.
 *
 * **Fails closed.** No credentials configured means 503, never a silent no-op and never a fake
 * success: an invoice that reports "timbrada" without a UUID is worse than one that refuses,
 * because the shop stops looking. Same rule as Turnstile and R2.
 */
import { valoresAjuste } from "../ajustes";
import { ClienteError } from "../clientes";
import { esEntorno } from "$lib/facturacion";
import { facturaCom } from "./factura-com";
import type { ConfigPac, ProveedorTimbrado } from "./tipos";

export type { ConfigPac, DatosReceptor, Documento, ProveedorTimbrado } from "./tipos";

/** Every provider the app can stamp through. Key order is the order the picker shows them. */
export const PROVEEDORES: Record<string, ProveedorTimbrado> = {
	[facturaCom.clave]: facturaCom,
};

export const PROVEEDOR_DEFAULT = facturaCom.clave;

/**
 * The active provider and its config, or a 503 saying exactly which piece is missing.
 *
 * Naming the missing field matters: "falta la API key" is actionable and "no se pudo timbrar" is
 * a support ticket. This is read on every stamp rather than cached, so rotating a credential on
 * the settings screen takes effect on the next invoice instead of on the next deploy.
 */
export async function proveedorActivo(): Promise<{ proveedor: ProveedorTimbrado; cfg: ConfigPac }> {
	const ajustes = await valoresAjuste([
		"facturacion.entorno",
		"facturacion.apiKey",
		"facturacion.secretKey",
		"facturacion.serie",
	]);

	const proveedor = PROVEEDORES[PROVEEDOR_DEFAULT];
	if (!proveedor) throw new ClienteError(503, "No hay proveedor de timbrado configurado.");

	const faltan = [
		["la API key", ajustes["facturacion.apiKey"]],
		["la secret key", ajustes["facturacion.secretKey"]],
		["la serie", ajustes["facturacion.serie"]],
	]
		.filter(([, v]) => !v)
		.map(([nombre]) => nombre);

	if (faltan.length > 0) {
		throw new ClienteError(
			503,
			`Facturación sin configurar: falta ${faltan.join(", ")}. Captúralo en Ajustes del sistema.`,
		);
	}

	const entorno = ajustes["facturacion.entorno"];
	if (!esEntorno(entorno)) throw new ClienteError(503, "El entorno de facturación está mal configurado.");

	return {
		proveedor,
		cfg: {
			entorno,
			apiKey: ajustes["facturacion.apiKey"],
			secretKey: ajustes["facturacion.secretKey"],
			serie: ajustes["facturacion.serie"],
		},
	};
}

/** Is stamping usable at all? For the screen, so a dead button is never rendered. */
export async function facturacionLista(): Promise<boolean> {
	try {
		await proveedorActivo();
		return true;
	} catch {
		return false;
	}
}
