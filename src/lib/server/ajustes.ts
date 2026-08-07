/**
 * Reading and writing app-wide settings.
 *
 * The catalogue is [$lib/ajustes](../ajustes.ts) and a key that is not in it cannot be written —
 * deny by default, same as the permission registry. Secrets are encrypted with a key that lives in
 * `AJUSTES_SECRET_KEY`, never in the database, so a dump of the database is not a set of
 * credentials.
 *
 * **Two doors, and only one of them ever returns a secret.** `leerAjustes` is for the screen and
 * the API and hands back hints; `valorSecreto` is for the code that has to make the call, and it
 * is not reachable from any route. Keeping them apart is what makes "a secret never reaches the
 * browser" something you can check by reading the call sites instead of trusting a mapper.
 */
import { env } from "$env/dynamic/private";
import prisma from "$lib/prisma";
import {
	AJUSTES,
	AJUSTE_KEYS,
	esClaveDeAjuste,
	esSecreto,
	pistaDeSecreto,
	valorPorDefecto,
	type ClaveAjuste,
} from "$lib/ajustes";
import { recordAudit } from "./audit";
import { ClienteError, trim } from "./clientes";
import { cifrar, descifrar, leerLlave } from "./cifrado";
import type { Actor } from "./guard";

/** Cached: the key never changes within a process, and reading it is a parse plus a length check. */
let llaveCache: Buffer | null = null;

function llave(): Buffer {
	if (!llaveCache) llaveCache = leerLlave(env.AJUSTES_SECRET_KEY);
	return llaveCache;
}

/**
 * Is the deployment able to hold secrets at all?
 *
 * Checked before a write rather than at import: the app has to boot and run without the key —
 * everything except the settings screen works fine — and failing at import would take the whole
 * shop down over a feature nobody was using.
 */
export function puedeGuardarSecretos(): boolean {
	try {
		llave();
		return true;
	} catch {
		return false;
	}
}

// --- Reading ------------------------------------------------------------------------------------

export type AjustePublico = {
	clave: ClaveAjuste;
	label: string;
	descripcion: string;
	tipo: string;
	grupo: string;
	ayuda: string | null;
	opciones: readonly { valor: string; label: string }[];
	/** Empty for a secret, always. */
	valor: string;
	/** `••••1234`, or empty when nothing is stored. Secrets only. */
	pista: string;
	configurado: boolean;
	actualizadoPor: string | null;
	actualizadoAt: string | null;
};

/**
 * Every setting in the catalogue, whether or not a row exists for it, with its definition.
 *
 * The catalogue is walked, not the table: a setting nobody has ever saved still has to appear on
 * the screen with its default, and reading only the rows would make "never configured" invisible —
 * which is exactly the state somebody needs to see.
 *
 * **A secret's `valor` is always empty here.** Not masked, not truncated: absent.
 */
export async function leerAjustes(): Promise<AjustePublico[]> {
	const filas = await prisma.ajuste.findMany({
		include: { actualizadoPor: { select: { name: true } } },
	});
	const porClave = new Map(filas.map((f) => [f.clave, f]));

	return AJUSTE_KEYS.map((clave) => {
		const def = AJUSTES[clave];
		const fila = porClave.get(clave);
		const secreto = esSecreto(clave);

		return {
			clave,
			label: def.label,
			descripcion: def.descripcion,
			tipo: def.tipo,
			grupo: def.grupo,
			ayuda: "ayuda" in def ? ((def.ayuda as string | undefined) ?? null) : null,
			opciones: [...(("opciones" in def ? def.opciones : undefined) ?? [])] as {
				valor: string;
				label: string;
			}[],
			valor: secreto ? "" : (fila?.valor ?? valorPorDefecto(clave)),
			pista: secreto ? (fila?.pista ?? "") : "",
			configurado: fila?.valor != null && fila.valor !== "",
			actualizadoPor: fila?.actualizadoPor?.name ?? null,
			actualizadoAt: fila?.updatedAt?.toISOString() ?? null,
		};
	});
}

/**
 * The decrypted value of one setting. **Server-internal: never reachable from a route.**
 *
 * Returns the catalogue default when nothing is stored, so a caller never has to distinguish
 * "unset" from "set to the default" — for `facturacion.entorno` those mean the same thing, and
 * making every caller remember that is how one of them forgets and stamps against production.
 */
export async function valorAjuste(clave: ClaveAjuste): Promise<string> {
	const fila = await prisma.ajuste.findUnique({ where: { clave } });
	if (!fila?.valor) return valorPorDefecto(clave);
	if (!fila.cifrado) return fila.valor;

	try {
		return descifrar(fila.valor, llave());
	} catch (err) {
		// A wrong or rotated `AJUSTES_SECRET_KEY`. Loud, because the alternative is a caller
		// treating an unreadable credential as an absent one and quietly falling back.
		console.error(`[ajustes] no se pudo descifrar "${clave}" — ¿cambió AJUSTES_SECRET_KEY?`, err);
		throw new ClienteError(503, "Las credenciales guardadas no se pueden leer. Vuelve a capturarlas en Ajustes.");
	}
}

/** Several at once, one query. */
export async function valoresAjuste<T extends ClaveAjuste>(claves: readonly T[]): Promise<Record<T, string>> {
	const filas = await prisma.ajuste.findMany({ where: { clave: { in: claves as unknown as string[] } } });
	const porClave = new Map(filas.map((f) => [f.clave, f]));

	const salida = {} as Record<T, string>;
	for (const clave of claves) {
		const fila = porClave.get(clave);
		if (!fila?.valor) {
			salida[clave] = valorPorDefecto(clave);
			continue;
		}
		if (!fila.cifrado) {
			salida[clave] = fila.valor;
			continue;
		}
		try {
			salida[clave] = descifrar(fila.valor, llave());
		} catch (err) {
			console.error(`[ajustes] no se pudo descifrar "${clave}"`, err);
			throw new ClienteError(
				503,
				"Las credenciales guardadas no se pueden leer. Vuelve a capturarlas en Ajustes.",
			);
		}
	}
	return salida;
}

// --- Writing ------------------------------------------------------------------------------------

/**
 * Save settings. Caller MUST have checked `ajustes:manage` **and** `esDueno`.
 *
 * Rules that are easy to get wrong and are enforced here:
 *
 * - An unregistered key is a 400, never a silently created row.
 * - **A blank secret means "leave it alone", not "erase it".** The screen cannot show the stored
 *   value, so an untouched secret field always posts empty — treating that as a delete would wipe
 *   the credentials every time somebody changed the environment dropdown.
 * - Clearing a secret is explicit: `<clave>__borrar`.
 * - An `opcion` only accepts one of its options.
 */
export async function guardarAjustes(input: { actor: Actor; body: Record<string, unknown> }) {
	const cambios: { clave: ClaveAjuste; valor: string | null; secreto: boolean }[] = [];

	for (const [campo, bruto] of Object.entries(input.body)) {
		const borrar = campo.endsWith("__borrar");
		const clave = borrar ? campo.slice(0, -"__borrar".length) : campo;
		if (!esClaveDeAjuste(clave)) continue; // Not a setting. Ignored, not an error: forms post extras.

		const secreto = esSecreto(clave);

		if (borrar) {
			if (bruto === "1" || bruto === "on" || bruto === true) {
				cambios.push({ clave, valor: null, secreto });
			}
			continue;
		}

		const valor = trim(bruto, 4096, AJUSTES[clave].label) ?? "";

		// The one that bites: an untouched secret field posts "". That is "I did not change it".
		if (secreto && valor === "") continue;

		const def = AJUSTES[clave] as { tipo: string; opciones?: readonly { valor: string }[] };
		if (def.tipo === "opcion" && !def.opciones?.some((o) => o.valor === valor)) {
			throw new ClienteError(400, `Valor inválido para ${AJUSTES[clave].label}`);
		}

		cambios.push({ clave, valor: valor === "" ? null : valor, secreto });
	}

	if (cambios.length === 0) throw new ClienteError(400, "No hay nada que guardar.");
	if (cambios.some((c) => c.secreto && c.valor !== null) && !puedeGuardarSecretos()) {
		throw new ClienteError(
			503,
			"Falta AJUSTES_SECRET_KEY en el servidor. Sin ella no se pueden guardar credenciales cifradas.",
		);
	}

	// The whole save commits or none of it does: half-applied credentials — a new API key beside
	// the old secret key — authenticate against nothing and the error names neither.
	await prisma.$transaction(async (tx) => {
		const previas = await tx.ajuste.findMany({
			where: { clave: { in: cambios.map((c) => c.clave) } },
			select: { clave: true, valor: true, pista: true },
		});
		const antes = new Map(previas.map((p) => [p.clave, p]));

		for (const { clave, valor, secreto } of cambios) {
			if (valor === null) {
				await tx.ajuste.deleteMany({ where: { clave } });
				continue;
			}
			const guardado = secreto ? cifrar(valor, llave()) : valor;
			const pista = secreto ? pistaDeSecreto(valor) : null;
			await tx.ajuste.upsert({
				where: { clave },
				create: { clave, valor: guardado, cifrado: secreto, pista, actualizadoPorId: input.actor.id },
				update: { valor: guardado, cifrado: secreto, pista, actualizadoPorId: input.actor.id },
			});
		}

		// **Never the values.** A secret in the audit trail is a secret in a table designed to be
		// append-only and widely read — the log would become the way to obtain access, which is the
		// one thing Rule 3 says it must never be. Not the hints either: a hint plus a rotation
		// history is more than nothing.
		await recordAudit(tx, {
			action: "ajuste.update",
			actor: input.actor,
			entityId: "sistema",
			entityLabel: "Ajustes del sistema",
			summary: `Ajustes actualizados: ${cambios.map((c) => c.clave).join(", ")}`,
			before: Object.fromEntries(
				cambios.map((c) => [c.clave, resumenValor(c.secreto, antes.get(c.clave)?.valor ?? null)]),
			),
			after: Object.fromEntries(cambios.map((c) => [c.clave, resumenValor(c.secreto, c.valor)])),
		});
	});

	return { guardados: cambios.map((c) => c.clave) };
}

/**
 * What an audit entry may say about a setting's value.
 *
 * A plaintext setting is recorded as-is — knowing the environment flipped to production is exactly
 * what the trail is for. A secret is recorded as whether one exists, and nothing else.
 */
const resumenValor = (secreto: boolean, valor: string | null): string =>
	secreto ? (valor ? "(definido)" : "(vacío)") : (valor ?? "(vacío)");
