/**
 * Bootstrap the first Admin, plus a small demo dataset.
 *
 * There is no public sign-up, so this is the only way to get an account into an empty
 * database. Everyone after this one arrives through an invitation issued from inside.
 *
 * Run: npx prisma db seed
 * Set SEED_ADMIN_PASSWORD in .env to choose the password; otherwise a random one is
 * generated and printed once. SEED_DEMO_PASSWORD does the same for the demo accounts.
 *
 * Everything here is idempotent — re-running never duplicates a row — and every write is
 * recorded in the audit trail (Rule 3) under a `semilla` actor, so demo data is never
 * mistaken for something a person did.
 *
 * Relative imports only: this runs under tsx, where `$lib` and `$env` do not resolve.
 */
import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { createAuth, createPrisma } from "../src/lib/server/bootstrap.js";
import { enZona, hoy, sumarDias } from "../src/lib/agenda.js";
import type { AuditAction } from "../src/lib/audit-actions.js";

const PRIMARY_ADMIN = {
	name: "Alan",
	email: "alan@maieutica.mx",
	role: "admin" as const,
};

/**
 * One account per role, same password, for trying the permission matrix without inviting
 * four people by hand.
 *
 * `.test` is a reserved TLD (RFC 2606) that can never resolve, so these addresses can never
 * accidentally receive real mail — and they are obviously not production accounts.
 */
const DEMO_USERS = [
	{ name: "Gabriela Gerente", email: "gerente@estacion360.test", role: "gerente" as const },
	{ name: "Omar Operador", email: "operador@estacion360.test", role: "operador" as const },
	{ name: "Tomás Taller", email: "taller@estacion360.test", role: "taller" as const },
];

// Fixed ids so a re-run updates rather than duplicates, and audit entries keep pointing at
// the same records.
const ID = {
	cliente: "5eed0000-0000-4000-8000-000000000001",
	contactoEntregador: "5eed0000-0000-4000-8000-000000000011",
	contactoAutorizador: "5eed0000-0000-4000-8000-000000000012",
	contactoFacturacion: "5eed0000-0000-4000-8000-000000000013",
	unidad: "5eed0000-0000-4000-8000-000000000021",
	propietario: "5eed0000-0000-4000-8000-000000000031",
	cita: "5eed0000-0000-4000-8000-000000000041",
};

const prisma = createPrisma(process.env.DATABASE_URL);
const auth = createAuth(prisma, process.env);

/** The seed is not a person. Recorded with a null actorId, same as the public booking form. */
const ACTOR = { id: null, email: "semilla@sistema" };

async function audit(action: AuditAction, entityId: string, entityLabel: string, summary: string) {
	await prisma.audit_log.create({
		data: {
			id: randomUUID(),
			action,
			entity: action.split(".")[0],
			entityId,
			entityLabel,
			actorId: ACTOR.id,
			actorEmail: ACTOR.email,
			summary,
		},
	});
}

async function seedAdmin() {
	const existing = await prisma.user.findUnique({
		where: { email: PRIMARY_ADMIN.email },
		select: { id: true, role: true },
	});

	if (existing) {
		if (existing.role !== PRIMARY_ADMIN.role) {
			await prisma.user.update({ where: { id: existing.id }, data: { role: PRIMARY_ADMIN.role } });
			console.log(`Rol corregido a ${PRIMARY_ADMIN.role}: ${PRIMARY_ADMIN.email}`);
		} else {
			console.log(`El admin principal ya existe: ${PRIMARY_ADMIN.email}`);
		}
		return;
	}

	// Never ship a hardcoded password. If none is supplied we generate one and print it
	// exactly once — it is not stored anywhere in plaintext.
	const supplied = process.env.SEED_ADMIN_PASSWORD;
	const password = supplied ?? randomBytes(12).toString("base64url");

	// No headers => trusted server call, so better-auth skips its admin permission check.
	// This is also why it works with emailAndPassword.disableSignUp turned on.
	await auth.api.createUser({ body: { ...PRIMARY_ADMIN, password } });

	console.log(`Admin principal creado: ${PRIMARY_ADMIN.email}`);
	console.log(supplied ? "Contraseña: la de SEED_ADMIN_PASSWORD" : `Contraseña generada (guárdala ahora): ${password}`);
}

async function seedDemoUsers(password: string) {
	for (const user of DEMO_USERS) {
		const existing = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } });
		if (existing) {
			console.log(`  ya existe: ${user.email}`);
			continue;
		}
		await auth.api.createUser({ body: { ...user, password } });
		console.log(`  creado: ${user.email} (${user.role})`);
	}
}

/**
 * An organización with three people on it. Deliberately an organización rather than a persona:
 * a company cannot sign for itself, so it is the case that actually needs named contacts —
 * and the three roles here cover both tiers of the contact rule.
 */
async function seedCliente() {
	if (await prisma.cliente.findUnique({ where: { id: ID.cliente }, select: { id: true } })) {
		console.log("  ya existe: Transportes del Desierto");
		return;
	}

	const cliente = await prisma.cliente.create({
		data: {
			id: ID.cliente,
			tipo: "organizacion",
			razonSocial: "Transportes del Desierto SA de CV",
			nombreCompleto: "Transportes del Desierto SA de CV",
			telefono: "6621002030",
			email: "contacto@transportesdeldesierto.test",
			direccion: "Blvd. Solidaridad 455, Col. Palo Verde, Hermosillo, Sonora",
			rfc: "TDE010203AB1",
			regimenFiscal: "601",
			codigoPostal: "83280",
			usoCfdi: "G03",
			notas: "Flotilla de reparto. Facturan cada quincena.",
		},
	});
	await audit("cliente.create", cliente.id, cliente.nombreCompleto, `Cliente de demostración: ${cliente.nombreCompleto}`);

	const contactos = [
		{
			id: ID.contactoEntregador,
			nombre: "María Fernanda Ruiz",
			telefono: "6621002031",
			email: "mruiz@transportesdeldesierto.test",
			identificacion: "INE 4471",
			roles: ["entregador"],
			notas: "Deja y recoge las unidades. Solo puede autorizarla un Gerente o Admin.",
		},
		{
			id: ID.contactoAutorizador,
			nombre: "Jorge Villalobos",
			telefono: "6621002032",
			email: "jvillalobos@transportesdeldesierto.test",
			identificacion: "INE 8890",
			roles: ["autorizador", "entregador"],
			notas: "Jefe de mantenimiento. Autoriza cotizaciones y también puede recoger.",
		},
		{
			id: ID.contactoFacturacion,
			nombre: "Lucía Beltrán",
			telefono: "6621002033",
			email: "facturacion@transportesdeldesierto.test",
			roles: ["facturacion"],
			notas: "Solo facturación. Un Operador puede darla de alta sin ayuda.",
		},
	];

	for (const contacto of contactos) {
		await prisma.cliente_contacto.create({
			data: { ...contacto, clienteId: cliente.id, alcanceUnidades: "todas" },
		});
		await audit(
			"contacto.create",
			contacto.id,
			`${contacto.nombre} (${cliente.nombreCompleto})`,
			`Contacto de demostración: ${contacto.nombre} — ${contacto.roles.join(", ")}`,
		);
	}
	console.log(`  creado: ${cliente.nombreCompleto} con ${contactos.length} contactos`);
}

/** One truck for the fleet. `unidad.clienteId` and the open ownership period are written together. */
async function seedUnidad() {
	if (await prisma.unidad.findUnique({ where: { id: ID.unidad }, select: { id: true } })) {
		console.log("  ya existe: la unidad de demostración");
		return;
	}

	await prisma.$transaction(async (tx) => {
		await tx.unidad.create({
			data: {
				id: ID.unidad,
				clienteId: ID.cliente,
				marca: "Freightliner",
				modelo: "M2 106",
				anio: 2021,
				color: "Blanco",
				placas: "SN-4471-A",
				vin: "3ALACWDT9MDMK1234",
				numeroEconomico: "ECO-114",
				kilometraje: 148320,
				notas: "Reparto local. Servicio cada 15 mil km.",
			},
		});
		await tx.unidad_propietario.create({
			data: { id: ID.propietario, unidadId: ID.unidad, clienteId: ID.cliente, motivo: "Alta inicial" },
		});
	});

	await audit("unidad.create", ID.unidad, "Freightliner M2 106 · SN-4471-A", "Unidad de demostración (ECO-114)");
	console.log("  creada: Freightliner M2 106 · ECO-114");
}

/**
 * An unconfirmed request, exactly as the public form leaves one: `origen = publico`,
 * `estado = solicitada`, a day and a franja but NO hour, and nothing linked yet. That is the
 * state the panel is meant to resolve — vincular a cliente and unidad, then confirm.
 */
async function seedCita() {
	if (await prisma.cita.findUnique({ where: { id: ID.cita }, select: { id: true } })) {
		console.log("  ya existe: la cita de demostración");
		return;
	}

	const fecha = sumarDias(hoy(), 2);
	const cita = await prisma.cita.create({
		data: {
			id: ID.cita,
			origen: "publico",
			estado: "solicitada",
			tipo: "recoleccion",
			fecha: enZona(fecha),
			franja: "manana",
			nombre: "Ricardo Salazar",
			telefono: "6629887766",
			email: "ricardo.salazar@correo.test",
			marca: "Nissan",
			modelo: "NP300",
			anio: 2019,
			placas: "VW-2210-B",
			motivo: "Se enciende el testigo del motor y jalonea al acelerar en frío.",
			direccionRecoleccion: "Calle Michoacán 118, Col. San Benito, Hermosillo",
		},
	});

	await audit(
		"cita.solicitud",
		cita.id,
		`#${cita.folio} · ${cita.nombre} · Nissan NP300`,
		`Cita de demostración sin confirmar, para el ${fecha} por la mañana`,
	);
	console.log(`  creada: cita #${cita.folio} sin confirmar (${fecha}, mañana, recolección)`);
}

async function main() {
	await seedAdmin();

	// Same password for all four demo accounts so the permission matrix is easy to try.
	const demoPassword =
		process.env.SEED_DEMO_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? randomBytes(12).toString("base64url");

	console.log("\nUsuarios de demostración (un rol cada uno):");
	await seedDemoUsers(demoPassword);
	console.log(
		process.env.SEED_DEMO_PASSWORD || process.env.SEED_ADMIN_PASSWORD
			? "  contraseña: la misma para los tres (SEED_DEMO_PASSWORD o SEED_ADMIN_PASSWORD)"
			: `  contraseña generada (guárdala ahora): ${demoPassword}`,
	);

	console.log("\nCliente de demostración:");
	await seedCliente();

	console.log("\nUnidad de demostración:");
	await seedUnidad();

	console.log("\nCita de demostración:");
	await seedCita();
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
