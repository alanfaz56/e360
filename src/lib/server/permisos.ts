import prisma from "$lib/prisma";
import {
	PERMISOS_DEFAULT,
	PERMISSION_KEYS,
	ROLES,
	actualizarPermisosCache,
	can,
	isRole,
	type Permission,
	type Role,
} from "$lib/roles";
import { recordAudit } from "./audit";
import { ClienteError } from "./clientes";
import type { Actor } from "./guard";

/**
 * The live half of the permission registry: reads `permiso_rol`, refreshes the in-memory cache
 * `can()` reads synchronously (see roles.ts for why it has to be a cache and not an async call),
 * and is the only place that table is ever written to.
 *
 * Self-seeding: a table with zero rows means nobody has ever loaded it since the migration ran,
 * so it is filled from `PERMISOS_DEFAULT` right here, on first read. That is what makes this
 * feature need no manual seed step — the first request after deploy does it.
 */

let ultimaCarga = 0;
const TTL_MS = 60_000;

async function sembrarSiVacio() {
	const total = await prisma.permiso_rol.count();
	if (total > 0) return;

	const filas = PERMISSION_KEYS.flatMap((permiso) =>
		PERMISOS_DEFAULT[permiso].map((rol) => ({ permiso, rol })),
	);
	// Not wrapped in the caller's transaction on purpose: this is a one-time bootstrap racing
	// other instances is harmless (createMany + skipDuplicates just no-ops the losers), whereas
	// tying it to whichever request happens to be first would make that request slower for no
	// reason after the very first time.
	await prisma.permiso_rol.createMany({ data: filas, skipDuplicates: true });
}

export async function cargarPermisosDesdeDB(): Promise<void> {
	await sembrarSiVacio();
	const filas = await prisma.permiso_rol.findMany({ select: { permiso: true, rol: true } });

	const mapa = new Map<string, Role[]>();
	for (const f of filas) {
		if (!isRole(f.rol)) continue; // A role retired from ROLES; its old grants are dead weight.
		const lista = mapa.get(f.permiso) ?? [];
		lista.push(f.rol);
		mapa.set(f.permiso, lista);
	}

	const datos: Partial<Record<Permission, readonly Role[]>> = {};
	for (const clave of PERMISSION_KEYS) {
		const roles = mapa.get(clave);
		if (roles) datos[clave] = roles;
	}
	actualizarPermisosCache(datos);
	ultimaCarga = Date.now();
}

/** Called from `hooks.server.ts` on every request; only actually hits the database when stale. */
export async function asegurarPermisosCache(): Promise<void> {
	if (Date.now() - ultimaCarga < TTL_MS) return;
	try {
		await cargarPermisosDesdeDB();
	} catch (err) {
		// A read failure here must not take down every request in the app — `can()` keeps working
		// off whatever it last had (or the coded defaults, if this is the very first attempt).
		console.error("asegurarPermisosCache falló, usando el registro previo:", err);
	}
}

export type FilaPermiso = { permiso: Permission; roles: Role[] };

/** Every permission key with who currently holds it, for the admin matrix. Never a partial read. */
export async function listPermisos(actor: Actor): Promise<FilaPermiso[]> {
	if (!can(actor.role, "permisos:manage")) throw new ClienteError(403, "Sin permiso: permisos:manage");
	await asegurarPermisosCache();
	return PERMISSION_KEYS.map((permiso) => ({
		permiso,
		roles: ROLES.filter((rol) => can(rol, permiso)),
	}));
}

/**
 * Apply a batch of (permiso, rol) → otorgado/no toggles in one write, refresh the cache, and
 * leave one audit entry naming exactly what changed — not one per checkbox, which would flood
 * the trail for what is functionally a single decision ("Operador can now close notas too").
 */
export async function actualizarPermisosMasivo(input: {
	actor: Actor;
	cambios: { permiso: string; rol: string; otorgado: boolean }[];
}): Promise<FilaPermiso[]> {
	if (!can(input.actor.role, "permisos:manage")) throw new ClienteError(403, "Sin permiso: permisos:manage");

	const validos = input.cambios.filter(
		(c): c is { permiso: Permission; rol: Role; otorgado: boolean } =>
			(PERMISSION_KEYS as string[]).includes(c.permiso) && isRole(c.rol),
	);

	// The one lockout guard: Admin can never lose the key that edits this very registry, or a
	// bad edit here is permanent — nobody, including Admin, could ever open this screen again to
	// fix it. Same reasoning as "never zero Admins" on user accounts.
	const seCierraLaPuerta = validos.some(
		(c) => c.permiso === "permisos:manage" && c.rol === "admin" && !c.otorgado,
	);
	if (seCierraLaPuerta) {
		throw new ClienteError(409, "Admin no puede perder permisos:manage — nadie podría volver a editar esto.");
	}

	const antes = await listPermisos(input.actor);
	const antesMapa = new Map(antes.map((f) => [f.permiso, new Set(f.roles)]));

	const cambiosReales = validos.filter((c) => (antesMapa.get(c.permiso)?.has(c.rol) ?? false) !== c.otorgado);
	if (cambiosReales.length === 0) return antes;

	await prisma.$transaction(async (tx) => {
		for (const c of cambiosReales) {
			if (c.otorgado) {
				await tx.permiso_rol.upsert({
					where: { permiso_rol: { permiso: c.permiso, rol: c.rol } },
					create: { permiso: c.permiso, rol: c.rol, otorgadoPorId: input.actor.id },
					update: {},
				});
			} else {
				await tx.permiso_rol.deleteMany({ where: { permiso: c.permiso, rol: c.rol } });
			}
		}

		await recordAudit(tx, {
			action: "permiso.actualizar",
			actor: input.actor,
			entityId: null,
			entityLabel: `${cambiosReales.length} permiso(s)`,
			summary: `Registro de permisos actualizado: ${cambiosReales
				.map((c) => `${c.permiso}/${c.rol} → ${c.otorgado ? "sí" : "no"}`)
				.join(", ")}`,
			before: Object.fromEntries(cambiosReales.map((c) => [`${c.permiso}/${c.rol}`, !c.otorgado])),
			after: Object.fromEntries(cambiosReales.map((c) => [`${c.permiso}/${c.rol}`, c.otorgado])),
		});
	});

	await cargarPermisosDesdeDB();
	return listPermisos(input.actor);
}
