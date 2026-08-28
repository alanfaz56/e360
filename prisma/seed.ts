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

	// --- Más unidades de la misma flotilla, cada una con su propia nota de servicio ----------
	// (`nota_servicio_unidad_abierta_key` permite solo una nota abierta por unidad).
	unidadDos: "5eed0000-0000-4000-8000-0000000000d1",
	propietarioDos: "5eed0000-0000-4000-8000-0000000000d2",
	unidadTres: "5eed0000-0000-4000-8000-0000000000d3",
	propietarioTres: "5eed0000-0000-4000-8000-0000000000d4",
	unidadCuatro: "5eed0000-0000-4000-8000-0000000000d5",
	propietarioCuatro: "5eed0000-0000-4000-8000-0000000000d6",

	// --- Catálogo e inventario ---------------------------------------------------------------
	productoFiltro: "5eed0000-0000-4000-8000-000000000081",
	productoManoObra: "5eed0000-0000-4000-8000-000000000082",
	productoAceite: "5eed0000-0000-4000-8000-000000000083",
	entradaFiltro: "5eed0000-0000-4000-8000-000000000091",
	capaFiltro: "5eed0000-0000-4000-8000-000000000092",
	entradaAceite: "5eed0000-0000-4000-8000-000000000093",
	capaAceite: "5eed0000-0000-4000-8000-000000000094",

	// --- Nota de servicio 1: cotización normal + factura + estimación interna -----------------
	nota1: "5eed0000-0000-4000-8000-0000000000a1",
	cotizacion1: "5eed0000-0000-4000-8000-0000000000a2",
	movimientoFiltroA1: "5eed0000-0000-4000-8000-0000000000a3",
	cotizacionInterna1: "5eed0000-0000-4000-8000-0000000000a4",
	factura1: "5eed0000-0000-4000-8000-0000000000a5",
	pagoFactura1: "5eed0000-0000-4000-8000-0000000000a6",

	// --- Nota de servicio 2: cotización vía CFDI + nota de venta → factura --------------------
	nota2: "5eed0000-0000-4000-8000-0000000000b1",
	entradaCfdi2: "5eed0000-0000-4000-8000-0000000000b2",
	cotizacion2: "5eed0000-0000-4000-8000-0000000000b3",
	notaVenta2: "5eed0000-0000-4000-8000-0000000000b4",
	pagoNotaVenta2: "5eed0000-0000-4000-8000-0000000000b5",
	factura2: "5eed0000-0000-4000-8000-0000000000b6",

	// --- Nota de servicio 3: trabajo abierto, sin cotizar todavía -----------------------------
	nota3: "5eed0000-0000-4000-8000-0000000000c1",
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
/** The two demo accounts most of the commercial flow is attributed to. */
async function demoStaff() {
	const [operador, mecanico] = await Promise.all([
		prisma.user.findUnique({ where: { email: "operador@estacion360.test" }, select: { id: true } }),
		prisma.user.findUnique({ where: { email: "taller@estacion360.test" }, select: { id: true } }),
	]);
	return { operadorId: operador?.id ?? null, mecanicoId: mecanico?.id ?? null };
}

/** Dos unidades más de la misma flotilla — cada nota de servicio de demostración necesita la suya. */
async function seedUnidadesFlotilla() {
	if (await prisma.unidad.findUnique({ where: { id: ID.unidadDos }, select: { id: true } })) {
		console.log("  ya existen: las unidades adicionales de la flotilla");
		return;
	}

	await prisma.$transaction(async (tx) => {
		await tx.unidad.create({
			data: {
				id: ID.unidadDos,
				clienteId: ID.cliente,
				marca: "Freightliner",
				modelo: "M2 106",
				anio: 2019,
				color: "Blanco",
				placas: "SN-4471-B",
				vin: "3ALACWDT9MDMK5678",
				numeroEconomico: "ECO-115",
				kilometraje: 148900,
				notas: "Reparto local. Segunda unidad de la flotilla.",
			},
		});
		await tx.unidad_propietario.create({
			data: { id: ID.propietarioDos, unidadId: ID.unidadDos, clienteId: ID.cliente, motivo: "Alta inicial" },
		});
		await tx.unidad.create({
			data: {
				id: ID.unidadTres,
				clienteId: ID.cliente,
				marca: "Kenworth",
				modelo: "T370",
				anio: 2020,
				color: "Blanco",
				placas: "SN-4471-C",
				vin: "1XKAD49X9LJ998877",
				numeroEconomico: "ECO-116",
				kilometraje: 149210,
				notas: "Reparto foráneo. Tercera unidad de la flotilla.",
			},
		});
		await tx.unidad_propietario.create({
			data: { id: ID.propietarioTres, unidadId: ID.unidadTres, clienteId: ID.cliente, motivo: "Alta inicial" },
		});
		await tx.unidad.create({
			data: {
				id: ID.unidadCuatro,
				clienteId: ID.cliente,
				marca: "International",
				modelo: "4300",
				anio: 2018,
				color: "Blanco",
				placas: "SN-4471-D",
				vin: "1HTMMAAL18H123456",
				numeroEconomico: "ECO-117",
				kilometraje: 149210,
				notas: "Reparto local. Cuarta unidad de la flotilla.",
			},
		});
		await tx.unidad_propietario.create({
			data: { id: ID.propietarioCuatro, unidadId: ID.unidadCuatro, clienteId: ID.cliente, motivo: "Alta inicial" },
		});
	});

	await audit("unidad.create", ID.unidadDos, "Freightliner M2 106 · SN-4471-B", "Unidad de demostración (ECO-115)");
	await audit("unidad.create", ID.unidadTres, "Kenworth T370 · SN-4471-C", "Unidad de demostración (ECO-116)");
	await audit("unidad.create", ID.unidadCuatro, "International 4300 · SN-4471-D", "Unidad de demostración (ECO-117)");
	console.log("  creadas: ECO-115, ECO-116 y ECO-117");
}

/** Catálogo: una refacción con FIFO real, un servicio de mano de obra, un insumo. */
async function seedProductos() {
	if (await prisma.producto.findUnique({ where: { id: ID.productoFiltro }, select: { id: true } })) {
		console.log("  ya existe: el catálogo de demostración");
		return;
	}

	await prisma.producto.create({
		data: {
			id: ID.productoFiltro,
			sku: "FIL-0114",
			nombre: "Filtro de aceite Freightliner M2",
			tipo: "refaccion",
			claveProdServ: "25172504",
			claveUnidad: "H87",
			unidad: "Pieza",
			precioVenta: "285.00",
			controlaInventario: true,
		},
	});
	await prisma.producto.create({
		data: {
			id: ID.productoManoObra,
			sku: null,
			nombre: "Mano de obra — servicio mayor",
			tipo: "mano_obra",
			claveProdServ: "78101803",
			claveUnidad: "HUR",
			unidad: "Hora",
			precioVenta: "450.00",
			controlaInventario: false,
			costoReferencia: "180.0000",
		},
	});
	await prisma.producto.create({
		data: {
			id: ID.productoAceite,
			sku: "ACE-15W40",
			nombre: "Aceite de motor 15W-40 (litro)",
			tipo: "insumo",
			claveProdServ: "15121517",
			claveUnidad: "LTR",
			unidad: "Litro",
			precioVenta: "165.00",
			controlaInventario: true,
		},
	});
	await audit("producto.create", ID.productoFiltro, "Filtro de aceite Freightliner M2", "Catálogo de demostración creado");
	console.log("  creados: filtro, mano de obra y aceite");
}

/**
 * Dos compras registradas: una sin CFDI (abre capa FIFO normal), una CON CFDI (la que
 * `seedNota2`/`seedCotizacion2` importan como referencia de costo sin pasar por inventario).
 */
async function seedInventario() {
	const { operadorId } = await demoStaff();

	if (await prisma.inventario_entrada.findUnique({ where: { id: ID.entradaFiltro }, select: { id: true } })) {
		console.log("  ya existe: la entrada de filtros");
	} else {
		await prisma.$transaction(async (tx) => {
			const entrada = await tx.inventario_entrada.create({
				data: {
					id: ID.entradaFiltro,
					proveedor: "Refaccionaria Diésel del Noroeste",
					referencia: "REM-88213",
					notas: "Compra de demostración, sin CFDI.",
					registradaPorId: operadorId,
				},
			});
			const capa = await tx.inventario_capa.create({
				data: {
					id: ID.capaFiltro,
					productoId: ID.productoFiltro,
					entradaId: entrada.id,
					cantidad: "20",
					restante: "20",
					costoUnitario: "150.0000",
				},
			});
			await tx.inventario_movimiento.create({
				data: {
					id: randomUUID(),
					productoId: ID.productoFiltro,
					tipo: "entrada",
					cantidad: "20",
					costoUnitario: "150.0000",
					costoTotal: "3000.00",
					capaId: capa.id,
					entradaId: entrada.id,
					registradoPorId: operadorId,
				},
			});
			await tx.producto.update({ where: { id: ID.productoFiltro }, data: { existencia: { increment: "20" } } });
		});
		await audit("inventario.entrada", ID.entradaFiltro, "Refaccionaria Diésel del Noroeste", "Compra de demostración: 20 filtros a $150.00");
		console.log("  creada: entrada de 20 filtros ($150.00 c/u)");
	}

	if (await prisma.inventario_entrada.findUnique({ where: { id: ID.entradaAceite }, select: { id: true } })) {
		console.log("  ya existe: la entrada de aceite");
	} else {
		await prisma.$transaction(async (tx) => {
			const entrada = await tx.inventario_entrada.create({
				data: {
					id: ID.entradaAceite,
					proveedor: "Lubricantes del Pacífico",
					referencia: "REM-77410",
					notas: "Compra de demostración, sin CFDI.",
					registradaPorId: operadorId,
				},
			});
			const capa = await tx.inventario_capa.create({
				data: {
					id: ID.capaAceite,
					productoId: ID.productoAceite,
					entradaId: entrada.id,
					cantidad: "80",
					restante: "80",
					costoUnitario: "95.0000",
				},
			});
			await tx.inventario_movimiento.create({
				data: {
					id: randomUUID(),
					productoId: ID.productoAceite,
					tipo: "entrada",
					cantidad: "80",
					costoUnitario: "95.0000",
					costoTotal: "7600.00",
					capaId: capa.id,
					entradaId: entrada.id,
					registradoPorId: operadorId,
				},
			});
			await tx.producto.update({ where: { id: ID.productoAceite }, data: { existencia: { increment: "80" } } });
		});
		await audit("inventario.entrada", ID.entradaAceite, "Lubricantes del Pacífico", "Compra de demostración: 80 litros de aceite a $95.00");
		console.log("  creada: entrada de 80 litros de aceite ($95.00 c/u)");
	}
}

/**
 * Nota #1: servicio mayor completo. Cotización con productos del catálogo (filtro surtido de
 * FIFO real + mano de obra), una estimación interna del mecánico aprobada y ligada — para que
 * `utilidadDeCotizacion` tenga AMBAS fuentes de costo a la vez — y una factura con un pago
 * parcial. Se detiene en `lista`: entregarla exigiría el checklist de liberación de 15 puntos,
 * que no aporta nada nuevo a esta demo.
 */
async function seedNota1() {
	if (await prisma.nota_servicio.findUnique({ where: { id: ID.nota1 }, select: { id: true } })) {
		console.log("  ya existe: la nota de servicio #1");
		return;
	}
	const { operadorId, mecanicoId } = await demoStaff();

	const nota = await prisma.nota_servicio.create({
		data: {
			id: ID.nota1,
			clienteId: ID.cliente,
			unidadId: ID.unidadDos,
			estado: "lista",
			motivo: "Servicio mayor: cambio de aceite y filtro, ruido en frenos delanteros",
			diagnostico: "Balatas delanteras al límite, se cambian junto con el servicio.",
			kilometraje: 148320,
			combustibleOctavos: 6,
			condicion: "Golpe leve en defensa trasera, ya existente.",
			inspeccionAt: new Date(Date.now() - 5 * 86_400_000),
			recibidaPorId: operadorId,
			recibidaAt: new Date(Date.now() - 5 * 86_400_000),
			mecanicoId,
		},
	});
	await audit("nota.create", nota.id, `Nota #${nota.folio}`, "Nota de servicio de demostración: servicio mayor");

	// Cotización: filtro del catálogo (surtido de FIFO, cuesta $150.00 real) + mano de obra.
	const subtotal = 285 * 1 + 450 * 2; // 285 filtro + 900 mano de obra = 1185
	const iva = Math.round(subtotal * 0.16);
	const total = subtotal + iva;
	const cotizacion = await prisma.cotizacion.create({
		data: {
			id: ID.cotizacion1,
			notaId: nota.id,
			estado: "autorizada",
			estadoInterno: "por_cobrar",
			subtotal: subtotal.toFixed(2),
			iva: iva.toFixed(2),
			total: total.toFixed(2),
			enviadaAt: new Date(Date.now() - 4 * 86_400_000),
			autorizadaPorContactoId: ID.contactoAutorizador,
			autorizadaMedio: "en persona",
			autorizadaAt: new Date(Date.now() - 4 * 86_400_000),
			creadaPorId: operadorId,
			conceptos: {
				create: [
					{
						id: randomUUID(),
						tipo: "refaccion",
						descripcion: "Filtro de aceite Freightliner M2",
						cantidad: "1",
						precioUnitario: "285.00",
						importe: "285.00",
						orden: 0,
						productoId: ID.productoFiltro,
						claveProdServ: "25172504",
						claveUnidad: "H87",
						surtido: "1",
					},
					{
						id: randomUUID(),
						tipo: "mano_obra",
						descripcion: "Mano de obra — servicio mayor",
						cantidad: "2",
						precioUnitario: "450.00",
						importe: "900.00",
						orden: 1,
						productoId: ID.productoManoObra,
						claveProdServ: "78101803",
						claveUnidad: "HUR",
					},
				],
			},
		},
		include: { conceptos: { orderBy: { orden: "asc" } } },
	});
	await audit("cotizacion.create", cotizacion.id, `Cotización #${cotizacion.folio}`, `Cotización de demostración autorizada por $${cotizacion.total}`);

	// El filtro se surte de la capa FIFO real (costo $150.00) — esto es lo que hace que
	// `utilidadDeCotizacion` calcule un margen real y no solo el de la estimación interna.
	const conceptoFiltro = cotizacion.conceptos.find((c) => c.productoId === ID.productoFiltro)!;
	await prisma.$transaction(async (tx) => {
		await tx.inventario_movimiento.create({
			data: {
				id: ID.movimientoFiltroA1,
				productoId: ID.productoFiltro,
				tipo: "salida",
				cantidad: "1",
				costoUnitario: "150.0000",
				costoTotal: "150.00",
				capaId: ID.capaFiltro,
				notaId: nota.id,
				conceptoId: conceptoFiltro.id,
				registradoPorId: operadorId,
			},
		});
		await tx.inventario_capa.update({ where: { id: ID.capaFiltro }, data: { restante: { decrement: "1" } } });
		await tx.producto.update({ where: { id: ID.productoFiltro }, data: { existencia: { decrement: "1" } } });
	});

	// Estimación interna del mecánico, aprobada y ligada a la misma cotización — labor que el
	// taller ya sabía que iba a costar antes de que existiera la cotización del cliente.
	const cotizacionInterna = await prisma.cotizacion_interna.create({
		data: {
			id: ID.cotizacionInterna1,
			notaId: nota.id,
			mecanicoId,
			cotizacionId: cotizacion.id,
			estado: "aprobada",
			total: "360.00",
			creadaPorId: mecanicoId,
			resueltaPorId: operadorId,
			resueltaAt: new Date(Date.now() - 4 * 86_400_000),
			conceptos: {
				create: [
					{
						id: randomUUID(),
						descripcion: "Mano de obra real — 2 horas a $180.00",
						cantidad: "2",
						costoUnitario: "180.00",
						importe: "360.00",
						orden: 0,
					},
				],
			},
		},
	});
	await audit(
		"cotizacion_interna.aprobada",
		cotizacionInterna.id,
		`Estimación #${cotizacionInterna.folio}`,
		"Estimación interna de demostración, aprobada y ligada a la cotización",
	);

	// Factura emitida con un pago parcial — el saldo pendiente queda visible en el panel.
	const factura = await prisma.factura.create({
		data: {
			id: ID.factura1,
			notaId: nota.id,
			clienteId: ID.cliente,
			cotizacionId: cotizacion.id,
			estado: "emitida",
			condicionPago: "credito",
			diasCredito: 30,
			vence: new Date(Date.now() + 26 * 86_400_000),
			subtotal: subtotal.toFixed(2),
			iva: iva.toFixed(2),
			total: total.toFixed(2),
			emitidaAt: new Date(Date.now() - 3 * 86_400_000),
			creadaPorId: operadorId,
			conceptos: {
				create: cotizacion.conceptos.map((c) => ({
					id: randomUUID(),
					tipo: c.tipo,
					descripcion: c.descripcion,
					cantidad: c.cantidad,
					precioUnitario: c.precioUnitario,
					importe: c.importe,
					orden: c.orden,
					productoId: c.productoId,
					claveProdServ: c.claveProdServ,
					claveUnidad: c.claveUnidad,
				})),
			},
		},
	});
	await audit("factura.create", factura.id, `Factura #${factura.folio}`, `Factura de demostración por $${factura.total}, a crédito`);

	await prisma.pago.create({
		data: {
			id: ID.pagoFactura1,
			facturaId: factura.id,
			monto: "700.00",
			metodo: "transferencia",
			referencia: "SPEI-004471",
			pagadoAt: new Date(Date.now() - 2 * 86_400_000),
			registradoPorId: operadorId,
		},
	});
	await audit("pago.register", factura.id, `Factura #${factura.folio}`, "Pago parcial de demostración: $700.00 por transferencia");

	console.log(`  creada: nota #${nota.folio}, cotización #${cotizacion.folio} facturada, saldo pendiente`);
}

/**
 * Nota #2: una refacción cotizada a partir de un CFDI de compra importado como referencia — sin
 * pasar por inventario — para mostrar la SEGUNDA fuente de costo de `utilidadDeCotizacion`
 * (`costoUnitario` copiado del CFDI, no un movimiento FIFO). La cotización se cobra como nota de
 * venta (sin IVA), se abona, y luego se convierte a factura: el flujo completo de la feature 3.
 */
async function seedNota2() {
	if (await prisma.nota_servicio.findUnique({ where: { id: ID.nota2 }, select: { id: true } })) {
		console.log("  ya existe: la nota de servicio #2");
		return;
	}
	const { operadorId } = await demoStaff();

	const nota = await prisma.nota_servicio.create({
		data: {
			id: ID.nota2,
			clienteId: ID.cliente,
			unidadId: ID.unidadTres,
			estado: "lista",
			motivo: "Cambio de balatas delanteras, pieza especial pedida a proveedor",
			diagnostico: "Balata importada, se compró expresamente para esta unidad.",
			kilometraje: 148900,
			inspeccionAt: new Date(Date.now() - 6 * 86_400_000),
			recibidaPorId: operadorId,
			recibidaAt: new Date(Date.now() - 6 * 86_400_000),
		},
	});
	await audit("nota.create", nota.id, `Nota #${nota.folio}`, "Nota de servicio de demostración: pieza especial vía CFDI");

	// Compra puntual con CFDI, importada como REFERENCIA de costo — nunca entra a inventario, así
	// que no hay capa ni movimiento: el único registro de lo que costó es `cfdiTotal` aquí y
	// `costoUnitario` en la línea de la cotización que la usa.
	const entradaCfdi = await prisma.inventario_entrada.create({
		data: {
			id: ID.entradaCfdi2,
			proveedor: "Refacciones Especializadas del Yaqui SA de CV",
			cfdiUuid: "5eed1111-2222-3333-4444-555566667777",
			cfdiEmisorRfc: "RYA980512XY3",
			cfdiEmisorNombre: "Refacciones Especializadas del Yaqui SA de CV",
			cfdiTotal: "696.00",
			cfdiFecha: new Date(Date.now() - 6 * 86_400_000),
			notas: "Compra de demostración vía CFDI, solo como referencia de costo — no entra a inventario.",
			registradaPorId: operadorId,
		},
	});
	await audit("inventario.entrada", entradaCfdi.id, entradaCfdi.proveedor!, "Compra de demostración vía CFDI: 1 juego de balatas a $600.00 + IVA");

	const subtotal = 950; // precio de venta de la balata especial
	const cotizacion = await prisma.cotizacion.create({
		data: {
			id: ID.cotizacion2,
			notaId: nota.id,
			estado: "autorizada",
			estadoInterno: "pendiente",
			subtotal: subtotal.toFixed(2),
			iva: "0.00",
			total: subtotal.toFixed(2),
			enviadaAt: new Date(Date.now() - 5 * 86_400_000),
			autorizadaPorContactoId: ID.contactoAutorizador,
			autorizadaMedio: "whatsapp",
			autorizadaAt: new Date(Date.now() - 5 * 86_400_000),
			creadaPorId: operadorId,
			conceptos: {
				create: [
					{
						id: randomUUID(),
						tipo: "refaccion",
						descripcion: "Juego de balatas delanteras (pieza especial)",
						cantidad: "1",
						precioUnitario: subtotal.toFixed(2),
						importe: subtotal.toFixed(2),
						orden: 0,
						entradaId: entradaCfdi.id,
						// Lo que costó según el CFDI del proveedor — la única fuente de costo posible
						// para una línea que nunca pasó por inventario.
						costoUnitario: "600.0000",
					},
				],
			},
		},
	});
	await audit("cotizacion.create", cotizacion.id, `Cotización #${cotizacion.folio}`, `Cotización de demostración autorizada por $${cotizacion.total} (sin IVA, costo vía CFDI)`);

	// Nota de venta: el cliente paga de contado y no pide factura todavía.
	const notaVenta = await prisma.nota_venta.create({
		data: {
			id: ID.notaVenta2,
			notaId: nota.id,
			clienteId: ID.cliente,
			cotizacionId: cotizacion.id,
			estado: "activa",
			total: subtotal.toFixed(2),
			notas: "Cliente pagó en efectivo, factura pendiente de definir.",
			creadaPorId: operadorId,
			conceptos: {
				create: [
					{
						id: randomUUID(),
						tipo: "refaccion",
						descripcion: "Juego de balatas delanteras (pieza especial)",
						cantidad: "1",
						precioUnitario: subtotal.toFixed(2),
						importe: subtotal.toFixed(2),
						orden: 0,
					},
				],
			},
		},
	});
	await audit("nota_venta.create", notaVenta.id, `Nota de venta #${notaVenta.folio}`, `Nota de venta de demostración por $${notaVenta.total}, sin IVA`);

	await prisma.pago.create({
		data: {
			id: ID.pagoNotaVenta2,
			notaVentaId: notaVenta.id,
			monto: "500.00",
			metodo: "efectivo",
			pagadoAt: new Date(Date.now() - 4 * 86_400_000),
			registradoPorId: operadorId,
		},
	});
	await audit("pago.register", notaVenta.id, `Nota de venta #${notaVenta.folio}`, "Pago parcial de demostración: $500.00 en efectivo");

	// El cliente cambió de opinión y sí pidió factura: se convierte, el IVA se calcula sobre el
	// subtotal y el pago ya hecho se re-apunta a la factura nueva — nada se vuelve a cobrar.
	const ivaFactura = Math.round(subtotal * 0.16);
	const totalFactura = subtotal + ivaFactura;
	const factura = await prisma.$transaction(async (tx) => {
		const creada = await tx.factura.create({
			data: {
				id: ID.factura2,
				notaId: nota.id,
				clienteId: ID.cliente,
				cotizacionId: cotizacion.id,
				estado: "emitida",
				condicionPago: "contado",
				subtotal: subtotal.toFixed(2),
				iva: ivaFactura.toFixed(2),
				total: totalFactura.toFixed(2),
				emitidaAt: new Date(Date.now() - 3 * 86_400_000),
				creadaPorId: operadorId,
				conceptos: {
					create: [
						{
							id: randomUUID(),
							tipo: "refaccion",
							descripcion: "Juego de balatas delanteras (pieza especial)",
							cantidad: "1",
							precioUnitario: subtotal.toFixed(2),
							importe: subtotal.toFixed(2),
							orden: 0,
						},
					],
				},
			},
		});
		await tx.pago.update({ where: { id: ID.pagoNotaVenta2 }, data: { notaVentaId: null, facturaId: creada.id } });
		await tx.nota_venta.update({ where: { id: notaVenta.id }, data: { estado: "facturada", facturaId: creada.id } });
		return creada;
	});
	await audit(
		"nota_venta.facturar",
		notaVenta.id,
		`Nota de venta #${notaVenta.folio}`,
		`Nota de venta de demostración convertida en factura #${factura.folio} por $${factura.total}`,
	);

	console.log(`  creada: nota #${nota.folio}, nota de venta #${notaVenta.folio} convertida en factura #${factura.folio}`);
}

/** Nota #3: trabajo abierto, recién recibido, sin cotizar todavía — un pendiente real en el tablero. */
async function seedNota3() {
	if (await prisma.nota_servicio.findUnique({ where: { id: ID.nota3 }, select: { id: true } })) {
		console.log("  ya existe: la nota de servicio #3");
		return;
	}
	const { operadorId } = await demoStaff();

	const nota = await prisma.nota_servicio.create({
		data: {
			id: ID.nota3,
			clienteId: ID.cliente,
			unidadId: ID.unidadCuatro,
			estado: "en_diagnostico",
			motivo: "Testigo de motor encendido, pérdida de potencia en subida",
			kilometraje: 149210,
			inspeccionAt: new Date(),
			recibidaPorId: operadorId,
			recibidaAt: new Date(),
		},
	});
	await audit("nota.create", nota.id, `Nota #${nota.folio}`, "Nota de servicio de demostración: trabajo abierto, sin cotizar");
	console.log(`  creada: nota #${nota.folio}, en diagnóstico`);
}

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

	console.log("\nMás unidades de la flotilla:");
	await seedUnidadesFlotilla();

	console.log("\nCatálogo de productos:");
	await seedProductos();

	console.log("\nCompras e inventario:");
	await seedInventario();

	console.log("\nNota de servicio 1 (cotización normal + estimación interna + factura a crédito):");
	await seedNota1();

	console.log("\nNota de servicio 2 (costo vía CFDI + nota de venta convertida a factura):");
	await seedNota2();

	console.log("\nNota de servicio 3 (trabajo abierto, sin cotizar):");
	await seedNota3();
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
