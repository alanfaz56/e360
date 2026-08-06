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
	citaConocida: "5eed0000-0000-4000-8000-000000000042",
	citaAsignada: "5eed0000-0000-4000-8000-000000000043",
	taller: "5eed0000-0000-4000-8000-000000000051",
	tallerDos: "5eed0000-0000-4000-8000-000000000052",
	tallerSolicitado: "5eed0000-0000-4000-8000-000000000053",
	sucursalUno: "5eed0000-0000-4000-8000-000000000071",
	sucursalDos: "5eed0000-0000-4000-8000-000000000072",
	sucursalSolicitada: "5eed0000-0000-4000-8000-000000000073",
	lecturaAlta: "5eed0000-0000-4000-8000-000000000061",
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
		// The odometer at registration is the first point on the mileage curve — without it the
		// history only starts at the first visit and there is nothing to measure usage against.
		await tx.unidad_kilometraje.create({
			data: {
				id: ID.lecturaAlta,
				unidadId: ID.unidad,
				kilometraje: 148320,
				origen: "alta",
				// Backdated so the demo shows a real interval instead of everything on one day.
				medidoAt: new Date(Date.now() - 120 * 86_400_000),
			},
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

/**
 * The other half of the vincular story: a request for a vehicle the shop ALREADY has on file,
 * still unlinked.
 *
 * Everything about the truck is free text repeating what the fleet's own person would say on the
 * phone — same placas, same VIN, same marca as the seeded unit — but `clienteId` and `unidadId`
 * stay null. Opening the vincular drawer on this one is what shows `sugerirUnidades` working: the
 * exact plate match comes back ranked first, carrying its owner with it, so the whole link is one
 * click instead of retyping a truck that already exists.
 *
 * Deliberately NOT linked. Seeding it already resolved would hide exactly the step this demo is
 * for, and would also make a second copy of the truck the likely outcome the first time somebody
 * uses the drawer for real.
 */
async function seedCitaDeUnidadConocida() {
	if (await prisma.cita.findUnique({ where: { id: ID.citaConocida }, select: { id: true } })) {
		console.log("  ya existe: la cita de la unidad registrada");
		return;
	}

	const fecha = sumarDias(hoy(), 3);
	const cita = await prisma.cita.create({
		data: {
			id: ID.citaConocida,
			origen: "publico",
			estado: "solicitada",
			tipo: "en_sitio",
			fecha: enZona(fecha),
			franja: "tarde",
			// The fleet's maintenance lead, as he would type it himself — not as a linked record.
			nombre: "Jorge Villalobos",
			telefono: "6621002032",
			email: "jvillalobos@transportesdeldesierto.test",
			marca: "Freightliner",
			modelo: "M2 106",
			anio: 2021,
			placas: "SN-4471-A",
			motivo: "Servicio de 150 mil km y revisión de frenos traseros. Ya truena al frenar cargado.",
		},
	});

	await audit(
		"cita.solicitud",
		cita.id,
		`#${cita.folio} · ${cita.nombre} · Freightliner M2 106`,
		`Cita de demostración de una unidad YA registrada (ECO-114), sin vincular, para el ${fecha} por la tarde`,
	);
	console.log(`  creada: cita #${cita.folio} de una unidad ya registrada, sin vincular (${fecha}, tarde)`);
}

/**
 * Partner workshops. Estación 360 receives the vehicle and sources the job out to one of these,
 * so a note cannot be transferred anywhere until at least one exists.
 */
async function seedTalleres() {
	const talleres = [
		{
			id: ID.taller,
			nombre: "Hojalatería y Pintura El Sahuaro",
			contacto: "Ramón Quintero",
			telefono: "6623015566",
			email: "contacto@elsahuaro.test",
			direccion: "Calle Yáñez 210, Col. Centenario, Hermosillo",
			especialidades: "Hojalatería, pintura, pulido",
			notas: "Entregan en 3 a 5 días. Cotizan por WhatsApp.",
		},
		{
			id: ID.tallerDos,
			nombre: "Transmisiones del Norte",
			contacto: "Elena Bracamontes",
			telefono: "6623027788",
			email: "taller@transmisionesdelnorte.test",
			direccion: "Blvd. Progreso 88, Parque Industrial, Hermosillo",
			especialidades: "Transmisiones automáticas, diferenciales",
			notas: "Especialistas en camión mediano.",
		},
	];

	for (const taller of talleres) {
		if (await prisma.taller.findUnique({ where: { id: taller.id }, select: { id: true } })) {
			console.log(`  ya existe: ${taller.nombre}`);
			continue;
		}
		// Added by staff, so already certified — `createTaller` makes the same decision.
		await prisma.taller.create({ data: { ...taller, origen: "panel", estado: "aprobado" } });
		await audit("taller.create", taller.id, taller.nombre, `Taller aliado de demostración: ${taller.nombre}`);
		console.log(`  creado: ${taller.nombre}`);
	}

	// Branches, so the head-office rule and the per-branch contact are exercisable. Only one
	// principal per taller — `taller_sucursal_principal_unica` would reject a second.
	const sucursales = [
		{
			id: ID.sucursalUno,
			tallerId: ID.taller,
			nombre: "Matriz Centenario",
			direccion: "Calle Yáñez 210, Col. Centenario, Hermosillo",
			ciudad: "Hermosillo",
			telefono: "6623015566",
			contactoNombre: "Ramón Quintero",
			contactoPuesto: "Dueño",
			contactoTelefono: "6623015566",
			esPrincipal: true,
		},
		{
			id: ID.sucursalDos,
			tallerId: ID.taller,
			nombre: "Sucursal Norte",
			direccion: "Blvd. Solidaridad 1450, Hermosillo",
			ciudad: "Hermosillo",
			telefono: "6623015599",
			contactoNombre: "Lucía Preciado",
			contactoPuesto: "Encargada de taller",
			contactoTelefono: "6623015599",
			esPrincipal: false,
		},
	];

	for (const sucursal of sucursales) {
		if (await prisma.taller_sucursal.findUnique({ where: { id: sucursal.id }, select: { id: true } })) continue;
		// The migration backfills a "Matriz" for every workshop already on file, so on an existing
		// database there IS one and `taller_sucursal_principal_unica` would reject a second. Demote
		// it first — the same thing `despromoverPrincipal` does in the app.
		if (sucursal.esPrincipal) {
			await prisma.taller_sucursal.updateMany({
				where: { tallerId: sucursal.tallerId, esPrincipal: true, archivedAt: null },
				data: { esPrincipal: false },
			});
		}
		await prisma.taller_sucursal.create({ data: sucursal });
		await audit("sucursal.create", sucursal.id, sucursal.nombre, `Sucursal de demostración: ${sucursal.nombre}`);
		console.log(`  creada sucursal: ${sucursal.nombre}`);
	}

	// One UNREVIEWED application, so the /talleres → certify flow has something to act on out of
	// the box — the same reason the seed ships an unconfirmed public cita.
	if (!(await prisma.taller.findUnique({ where: { id: ID.tallerSolicitado }, select: { id: true } }))) {
		const solicitado = await prisma.taller.create({
			data: {
				id: ID.tallerSolicitado,
				nombre: "Servicio Diésel La Cuesta",
				contacto: "Job Villaescusa",
				telefono: "6623044321",
				email: "contacto@dieselacuesta.test",
				direccion: "Carretera a Bahía de Kino km 4, Hermosillo",
				ciudad: "Hermosillo",
				especialidades: "Diésel, inyección, turbos",
				notas: "Nos encontraron por un cliente. Trabajan camión pesado.",
				anosOperando: 12,
				empleados: 6,
				origen: "publico",
				estado: "solicitado",
			},
		});
		await prisma.taller_sucursal.create({
			data: {
				id: ID.sucursalSolicitada,
				tallerId: solicitado.id,
				nombre: "Matriz",
				direccion: solicitado.direccion,
				ciudad: solicitado.ciudad,
				telefono: solicitado.telefono,
				contactoNombre: solicitado.contacto,
				contactoTelefono: solicitado.telefono,
				contactoEmail: solicitado.email,
				esPrincipal: true,
			},
		});
		await audit(
			"taller.solicitud",
			solicitado.id,
			solicitado.nombre,
			`Solicitud de certificación de demostración: ${solicitado.nombre}`,
		);
		console.log(`  creada solicitud por revisar: ${solicitado.nombre}`);
	}
}

/**
 * A confirmed pickup ASSIGNED to the demo Operador, ready to be received.
 *
 * This is the one that exercises the whole operator flow end to end: it is already linked to the
 * fleet customer and its truck, so "Recibir unidad" opens a nota de servicio in one press — and
 * from there the inspection, the evidence, the transfer to a partner shop and the delivery.
 */
async function seedCitaAsignada() {
	if (await prisma.cita.findUnique({ where: { id: ID.citaAsignada }, select: { id: true } })) {
		console.log("  ya existe: la cita asignada al operador");
		return;
	}

	const operador = await prisma.user.findUnique({
		where: { email: "operador@estacion360.test" },
		select: { id: true },
	});
	if (!operador) {
		console.log("  omitida: no existe el operador de demostración");
		return;
	}

	const fecha = hoy();
	const cita = await prisma.cita.create({
		data: {
			id: ID.citaAsignada,
			origen: "panel",
			estado: "confirmada",
			tipo: "recoleccion",
			fecha: enZona(fecha),
			// 09:00 shop time. Confirmed appointments must carry a real hour (CHECK constraint).
			inicio: enZona(fecha, "09:00"),
			fin: enZona(fecha, "10:00"),
			nombre: "Jorge Villalobos",
			telefono: "6621002032",
			email: "jvillalobos@transportesdeldesierto.test",
			marca: "Freightliner",
			modelo: "M2 106",
			anio: 2021,
			placas: "SN-4471-A",
			motivo: "Ruido en la suspensión trasera y servicio mayor. Va a necesitar hojalatería en la caja.",
			direccionRecoleccion: "Blvd. Solidaridad 455, Col. Palo Verde, Hermosillo",
			clienteId: ID.cliente,
			unidadId: ID.unidad,
			entregadorId: ID.contactoEntregador,
			asignadoId: operador.id,
		},
	});

	await audit(
		"cita.create",
		cita.id,
		`#${cita.folio} · ${cita.nombre} · Freightliner M2 106`,
		`Cita de demostración asignada al operador para hoy ${fecha}, lista para recibir`,
	);
	console.log(`  creada: cita #${cita.folio} asignada a Omar Operador (hoy ${fecha}, 09:00, recolección)`);
}

/** Credit terms on the fleet customer, so the invoicing and limit rules have something to act on. */
async function seedCredito() {
	const cliente = await prisma.cliente.findUnique({
		where: { id: ID.cliente },
		select: { limiteCredito: true },
	});
	if (!cliente) return;
	if (cliente.limiteCredito !== null) {
		console.log("  ya existe: el crédito del cliente de demostración");
		return;
	}

	await prisma.cliente.update({
		where: { id: ID.cliente },
		data: { limiteCredito: "50000.00", diasCredito: 30 },
	});
	await audit(
		"cliente.credito",
		ID.cliente,
		"Transportes del Desierto SA de CV",
		"Crédito de demostración: $50,000.00 a 30 días",
	);
	console.log("  creado: crédito de $50,000.00 a 30 días");
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

	// Two unlinked requests on purpose: one for a vehicle nobody has seen before (register it),
	// and one for a vehicle already on file (pick the suggestion). They are the two halves of
	// what the vincular drawer is for.
	console.log("\nCrédito del cliente:");
	await seedCredito();

	console.log("\nTalleres aliados:");
	await seedTalleres();

	console.log("\nCitas de demostración (ninguna vinculada todavía):");
	await seedCita();
	await seedCitaDeUnidadConocida();

	console.log("\nCita lista para recibir:");
	await seedCitaAsignada();
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
