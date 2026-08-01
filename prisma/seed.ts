/**
 * Bootstrap the first Admin.
 *
 * There is no public sign-up, so this is the only way to get an account into an empty
 * database. Everyone after this one arrives through an invitation issued from inside.
 *
 * Run: npx prisma db seed
 * Set SEED_ADMIN_PASSWORD in .env to choose the password; otherwise a random one is
 * generated and printed once.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createAuth, createPrisma } from "../src/lib/server/bootstrap.js";

const PRIMARY_ADMIN = {
	name: "Alan",
	email: "alan@maieutica.mx",
	role: "admin" as const,
};

const prisma = createPrisma(process.env.DATABASE_URL);
const auth = createAuth(prisma, process.env);

async function main() {
	const existing = await prisma.user.findUnique({
		where: { email: PRIMARY_ADMIN.email },
		select: { id: true, role: true },
	});

	if (existing) {
		if (existing.role !== PRIMARY_ADMIN.role) {
			await prisma.user.update({
				where: { id: existing.id },
				data: { role: PRIMARY_ADMIN.role },
			});
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
	await auth.api.createUser({
		body: { ...PRIMARY_ADMIN, password },
	});

	console.log(`Admin principal creado: ${PRIMARY_ADMIN.email}`);
	if (supplied) {
		console.log("Contraseña: la de SEED_ADMIN_PASSWORD");
	} else {
		console.log(`Contraseña generada (guárdala ahora): ${password}`);
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
