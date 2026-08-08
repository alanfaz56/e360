/**
 * One-off import: clientes, unidades y notas de servicio del tenant "estacion360" en mitaller
 * (la SaaS anterior del taller, D:\Development\Maieutica\mitaller) hacia esta base.
 *
 * Fuera de alcance a propósito: dinero (Cost/Payment), comentarios, evidencia/fotos, firmas.
 *
 * Uso:
 *   tsx --tsconfig scripts/tsconfig.json scripts/import-mitaller-estacion360.ts --actor-email admin@correo [--dry-run]
 *
 * Requiere en el entorno:
 *   DATABASE_URL           — la base de e360. Debe ser localhost salvo ALLOW_E360_NEON=1.
 *   MITALLER_SOURCE_URL    — Postgres de mitaller (Neon "fixrlink"), solo lectura.
 *                            Requiere ALLOW_MITALLER_NEON=1.
 *
 * Por qué pasa por las funciones reales (createCliente, createUnidad, crearNota, avanzarNota,
 * entregarNota, cancelarNota) y no escribe directo con Prisma como prisma/seed.ts: así el trim(),
 * las validaciones y la auditoría (Regla 3) corren exactamente igual que si alguien lo hubiera
 * capturado a mano. El costo es que esas funciones importan el singleton `$lib/prisma`, que a su
 * vez lee `$env/dynamic/private` — un módulo virtual de Vite que no existe como archivo. Por eso
 * este script se corre con `--tsconfig scripts/tsconfig.json`, que redirige esa ruta a
 * `scripts/env-shim.ts` (ver ese archivo) SOLO para scripts — la app real nunca ve ese shim,
 * Vite resuelve `$env/*` con su propio plugin sin tocar tsconfig "paths".
 *
 * Idempotencia: sin cambio de esquema. Cada creación real se marca con un segundo renglón de
 * `audit_log` (misma action que la función real ya usa) cuyo `after` incluye `{ mitallerId }`.
 * Antes de crear algo se busca ese marcador; si existe, se reusa el id en vez de duplicar.
 *
 * Dry-run: las funciones reales abren su PROPIA transacción contra el singleton `prisma`, así que
 * no hay forma de envolver todo en una transacción externa y hacer rollback (no aceptan un `tx`
 * externo). `--dry-run` en vez de eso NO llama ninguna función que escribe — solo lee mitaller y
 * el marcador de linaje, y reporta qué haría. La única forma de validar los CHECK constraints de
 * verdad es correr el import real contra la base LOCAL.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

function argValue(flag: string): string | undefined {
	const i = process.argv.indexOf(flag);
	return i === -1 ? undefined : process.argv[i + 1];
}

const DRY_RUN = process.argv.includes("--dry-run");
const ACTOR_EMAIL = argValue("--actor-email");

function guardE360Db(url: string) {
	let local = false;
	try {
		local = /^(localhost|127\.0\.0\.1)$/i.test(new URL(url).hostname);
	} catch {
		throw new Error("DATABASE_URL no es una URL válida.");
	}
	if (!local && process.env.ALLOW_E360_NEON !== "1") {
		throw new Error(
			"DATABASE_URL no es localhost. Este script solo corre contra e360 local por defecto. " +
				"La corrida real contra Neon la hace el usuario, a propósito, con ALLOW_E360_NEON=1.",
		);
	}
}

function guardMitallerDb(url: string | undefined) {
	if (!url) throw new Error("Falta MITALLER_SOURCE_URL.");
	if (process.env.ALLOW_MITALLER_NEON !== "1") {
		throw new Error(
			"Falta ALLOW_MITALLER_NEON=1 — el acceso de solo lectura a mitaller requiere autorización " +
				"explícita, separada de la de e360.",
		);
	}
}

async function pgAll<T>(pool: Pool, sql: string, params: unknown[] = []): Promise<T[]> {
	const res = await pool.query(sql, params);
	return res.rows as T[];
}

async function pgOne<T>(pool: Pool, sql: string, params: unknown[] = []): Promise<T | null> {
	const rows = await pgAll<T>(pool, sql, params);
	return rows[0] ?? null;
}

type ReportEntity = "cliente" | "unidad" | "nota";

/** Same action key the real creation already uses — `audit_log.after.mitallerId` is what marks it as ours. */
const ACTION_POR_ENTIDAD: Record<ReportEntity, string> = {
	cliente: "cliente.create",
	unidad: "unidad.create",
	nota: "nota.create",
};

async function yaImportado(prisma: any, entity: ReportEntity, mitallerId: string): Promise<string | null> {
	const row = await prisma.audit_log.findFirst({
		where: { entity, after: { path: ["mitallerId"], equals: mitallerId } },
		select: { entityId: true },
	});
	return row?.entityId ?? null;
}

async function marcarImportado(
	prisma: any,
	actor: { id: string; email: string },
	entity: ReportEntity,
	entityId: string,
	mitallerId: string,
) {
	await prisma.audit_log.create({
		data: {
			id: randomUUID(),
			action: ACTION_POR_ENTIDAD[entity],
			entity,
			entityId,
			actorId: actor.id,
			actorEmail: actor.email,
			summary: `Importado de mitaller (id ${mitallerId})`,
			after: { mitallerId, origen: "import-mitaller" },
		},
	});
}

type MitallerUsuario = {
	id: string;
	email: string | null;
	telefono: string | null;
	firstName: string;
	lastName: string | null;
	createdAt: Date;
};
type MitallerDevice = {
	dbcId: string;
	shortName: string | null;
	deviceId: string;
	serie: string;
	year: string | null;
	marca: string;
	commonName: string;
	modelName: string;
};
type MitallerReceipt = {
	id: string;
	folio: number;
	deviceId: string;
	customerId: string;
	createdAt: Date;
	isActive: boolean;
	kilometraje: number | null;
	finishedAt: Date | null;
	status: "RECIBIDO" | "EN_CURSO" | "COMPLETADO" | "ENTREGADO";
	entregadaAt: Date | null;
};

async function main() {
	if (!ACTOR_EMAIL) throw new Error("Falta --actor-email <correo>: un Admin o Gerente real que ya exista en e360.");

	guardE360Db(process.env.DATABASE_URL ?? "");
	guardMitallerDb(process.env.MITALLER_SOURCE_URL);

	// Antes de importar cualquier módulo de $lib/server — notificar() lee esto en cada llamada.
	process.env.IMPORT_MODE = "1";

	const { default: prisma } = await import("$lib/prisma.js");
	const { createCliente } = await import("$lib/server/clientes.js");
	const { createUnidad } = await import("$lib/server/unidades.js");
	const { crearNota, avanzarNota, entregarNota, cancelarNota } = await import("$lib/server/notas.js");

	const pool = new Pool({ connectionString: process.env.MITALLER_SOURCE_URL });

	const report = {
		clientesCreados: 0,
		clientesReusados: 0,
		unidadesCreadas: 0,
		unidadesReusadas: 0,
		notasCreadas: 0,
		notasReusadas: 0,
		cerradosForzados: 0,
		omitidos: [] as string[],
		errores: [] as string[],
		muestraNotas: [] as string[],
	};

	try {
		const actorRow = await prisma.user.findUniqueOrThrow({
			where: { email: ACTOR_EMAIL },
			select: { id: true, email: true, name: true, role: true },
		});
		if (actorRow.role !== "admin" && actorRow.role !== "gerente") {
			throw new Error(`${ACTOR_EMAIL} no es admin ni gerente en e360 — no tiene permiso para crear clientes/unidades/notas.`);
		}
		const actor = { id: actorRow.id, email: actorRow.email, name: actorRow.name, role: actorRow.role, tallerId: null } as const;

		const company = await pgOne<{ id: string }>(pool, `select id from "Company" where name = $1`, ["estacion360"]);
		if (!company) throw new Error("No se encontró Company.name = 'estacion360' en mitaller.");
		const companyId = company.id;

		// ================================================================================ Clientes
		const usuarios = await pgAll<MitallerUsuario>(
			pool,
			`select id, email, telefono, "firstName", "lastName", "createdAt" from "auth_user" where "companyId" = $1 and role = 'CLIENTE'`,
			[companyId],
		);

		const clienteIdMap = new Map<string, string>(); // mitaller User.id -> e360 cliente.id

		for (const u of usuarios) {
			const existente = await yaImportado(prisma, "cliente", u.id);
			if (existente) {
				clienteIdMap.set(u.id, existente);
				report.clientesReusados++;
				continue;
			}
			if (DRY_RUN) {
				// Marcador falso solo para que las cuentas de unidades/notas en dry-run tengan con
				// qué encontrar a este cliente — nada se escribe, así que no hay id real todavía.
				clienteIdMap.set(u.id, `dry:${u.id}`);
				report.clientesCreados++; // "se crearía"
				continue;
			}
			try {
				const cliente = await createCliente({
					actor,
					body: {
						tipo: "persona",
						nombre: u.firstName,
						apellidos: u.lastName ?? undefined,
						telefono: u.telefono ?? undefined,
						email: u.email ?? undefined,
					},
				});
				clienteIdMap.set(u.id, cliente.id);
				await marcarImportado(prisma, actor, "cliente", cliente.id, u.id);
				await prisma.cliente.update({
					where: { id: cliente.id },
					data: { createdAt: u.createdAt, updatedAt: u.createdAt },
				});
				report.clientesCreados++;
			} catch (err) {
				report.errores.push(`cliente ${u.id} (${u.firstName}): ${(err as Error).message}`);
			}
		}

		// ================================================================================ Unidades
		const devices = await pgAll<MitallerDevice>(
			pool,
			`select dbc.id as "dbcId", dbc."shortName", d.id as "deviceId", d.serie, d.year,
			        mk.name as marca, mo."commonName", mo."modelName"
			 from "DeviceByCompany" dbc
			 join "Device" d on d.id = dbc."deviceId"
			 join "Model" mo on mo.id = d."modeloId"
			 join "Make" mk on mk.id = mo."marcaId"
			 where dbc."companyId" = $1`,
			[companyId],
		);

		const unidadIdMap = new Map<string, string>(); // mitaller Device.id -> e360 unidad.id

		for (const d of devices) {
			const existente = await yaImportado(prisma, "unidad", d.deviceId);
			if (existente) {
				unidadIdMap.set(d.deviceId, existente);
				report.unidadesReusadas++;
				continue;
			}

			// Sin campo de dueño en mitaller: se infiere del Receipt más reciente de este device.
			// Limitación documentada — ver el plan. El historial por nota SÍ es exacto.
			const owner = await pgOne<{ customerId: string }>(
				pool,
				`select "customerId" from "Receipt" where "deviceId" = $1 and "companyId" = $2 order by "createdAt" desc limit 1`,
				[d.deviceId, companyId],
			);
			if (!owner) {
				report.omitidos.push(`unidad ${d.deviceId} (${d.serie}): sin ninguna Receipt, no hay dueño que inferir`);
				continue;
			}
			const clienteId = clienteIdMap.get(owner.customerId);
			if (!clienteId) {
				report.omitidos.push(`unidad ${d.deviceId} (${d.serie}): su dueño inferido no se importó como cliente`);
				continue;
			}

			const primero = await pgOne<{ kilometraje: number | null; createdAt: Date }>(
				pool,
				`select kilometraje, "createdAt" from "Receipt"
				 where "deviceId" = $1 and "companyId" = $2 order by "createdAt" asc limit 1`,
				[d.deviceId, companyId],
			);

			const anio = d.year && /^\d{4}$/.test(d.year.trim()) ? Number(d.year) : null;
			const serie = d.serie?.trim() ?? "";
			const serieEsVin = serie.length >= 5 && serie.length <= 24;

			if (DRY_RUN) {
				unidadIdMap.set(d.deviceId, `dry:${d.deviceId}`);
				report.unidadesCreadas++;
				continue;
			}
			try {
				const unidad = await createUnidad({
					actor,
					clienteId,
					body: {
						marca: d.marca,
						modelo: d.commonName || d.modelName,
						anio,
						vin: serieEsVin ? serie : undefined,
						numeroEconomico: d.shortName ?? undefined,
						kilometraje: primero?.kilometraje ?? undefined,
						notas: serieEsVin || !serie ? undefined : `Serie de mitaller (no válida como VIN): ${serie}`,
					},
				});
				unidadIdMap.set(d.deviceId, unidad.id);
				await marcarImportado(prisma, actor, "unidad", unidad.id, d.deviceId);
				// mitaller no registra cuándo se dio de alta el vehículo — se usa su primera Receipt
				// conocida como aproximación, documentada igual que la inferencia del dueño.
				if (primero) {
					await prisma.unidad.update({
						where: { id: unidad.id },
						data: { createdAt: primero.createdAt, updatedAt: primero.createdAt },
					});
				}
				report.unidadesCreadas++;
			} catch (err) {
				report.errores.push(`unidad ${d.deviceId} (${d.serie}): ${(err as Error).message}`);
			}
		}

		// =================================================================================== Notas
		const receipts = await pgAll<MitallerReceipt>(
			pool,
			`select r.id, r.folio, r."deviceId", r."customerId", r."createdAt", r."isActive", r.kilometraje,
			        r."finishedAt", r.status, dt."createdAt" as "entregadaAt"
			 from "Receipt" r
			 left join "DeliveryTicket" dt on dt.id = r."deliveryTicketId"
			 where r."companyId" = $1
			 order by r."deviceId", r."createdAt" asc`,
			[companyId],
		);

		const porDevice = new Map<string, MitallerReceipt[]>();
		for (const r of receipts) {
			const arr = porDevice.get(r.deviceId) ?? [];
			arr.push(r);
			porDevice.set(r.deviceId, arr);
		}

		for (const [deviceId, lista] of porDevice) {
			const unidadId = unidadIdMap.get(deviceId);
			if (!unidadId) continue; // la unidad se omitió — sus notas se van con ella

			for (let i = 0; i < lista.length; i++) {
				const r = lista[i];
				const esUltimo = i === lista.length - 1;

				const existente = await yaImportado(prisma, "nota", r.id);
				if (existente) {
					report.notasReusadas++;
					continue;
				}

				const clienteId = clienteIdMap.get(r.customerId);
				if (!clienteId) {
					report.omitidos.push(`nota ${r.id} (folio original #${r.folio}): su cliente no se importó`);
					continue;
				}

				if (DRY_RUN) {
					report.notasCreadas++;
					continue;
				}

				try {
					const nota = await crearNota({
						actor,
						body: {
							clienteId,
							unidadId,
							motivo: `Nota migrada de mitaller (folio original #${r.folio})`,
							kilometraje: r.kilometraje ?? undefined,
							forzarKilometraje: "1",
						},
					});

					// Una nota abierta por unidad a la vez. mitaller no tenía esa regla, así que todo
					// lo que no sea la última cronológica se cierra a fuerza si no llegó terminal.
					const forzarCierre = !esUltimo && r.isActive && r.status !== "ENTREGADO";

					if (!r.isActive) {
						await cancelarNota({ actor, id: nota.id, motivo: "Migrado de mitaller: registro marcado inactivo" });
					} else if (forzarCierre) {
						await cancelarNota({
							actor,
							id: nota.id,
							motivo: "Cerrada automáticamente durante la migración: existe una nota posterior para la misma unidad",
						});
						report.cerradosForzados++;
					} else {
						if (r.status === "EN_CURSO") {
							await avanzarNota({ actor, id: nota.id, estado: "en_diagnostico" });
						} else if (r.status === "COMPLETADO" || r.status === "ENTREGADO") {
							await avanzarNota({ actor, id: nota.id, estado: "lista" });
						}
						if (r.status === "ENTREGADO") {
							await entregarNota({ actor, id: nota.id });
						}
					}

					await marcarImportado(prisma, actor, "nota", nota.id, r.id);
					await prisma.nota_servicio.update({
						where: { id: nota.id },
						data: {
							recibidaAt: r.createdAt,
							createdAt: r.createdAt,
							updatedAt: r.entregadaAt ?? r.finishedAt ?? r.createdAt,
							...(r.entregadaAt ? { entregadaAt: r.entregadaAt } : {}),
						},
					});

					report.notasCreadas++;
					if (report.muestraNotas.length < 5 || Math.random() < 0.1) {
						if (report.muestraNotas.length >= 5) report.muestraNotas.shift();
						report.muestraNotas.push(`nota ${nota.id} (folio ${nota.folio}, mitaller #${r.folio})`);
					}
				} catch (err) {
					report.errores.push(`nota ${r.id} (folio original #${r.folio}): ${(err as Error).message}`);
				}
			}
		}
	} finally {
		await pool.end();
		await prisma?.$disconnect?.();
	}

	console.log(DRY_RUN ? "\n=== DRY RUN — nada se escribió ===" : "\n=== Import terminado ===");
	console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
