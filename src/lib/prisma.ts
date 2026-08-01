import { env } from "$env/dynamic/private";
import { createPrisma } from "./server/bootstrap";

const prisma = createPrisma(env.DATABASE_URL);
export default prisma;
