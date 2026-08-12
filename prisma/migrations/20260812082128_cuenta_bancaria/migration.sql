-- CreateTable
CREATE TABLE "cuenta_bancaria" (
    "id" TEXT NOT NULL,
    "banco" VARCHAR(100) NOT NULL,
    "titular" VARCHAR(200) NOT NULL,
    "clabe" VARCHAR(18),
    "numeroCuenta" VARCHAR(30),
    "notas" VARCHAR(255),
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "actualizadoPorId" TEXT,

    CONSTRAINT "cuenta_bancaria_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cuenta_bancaria" ADD CONSTRAINT "cuenta_bancaria_actualizadoPorId_fkey" FOREIGN KEY ("actualizadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one live account may be the principal — Prisma cannot express a partial unique index,
-- so it is declared here by hand, same pattern as taller_sucursal_principal_unica. Promoting a
-- second principal without demoting the first must fail the write, not silently take over.
CREATE UNIQUE INDEX "cuenta_bancaria_principal_unica" ON "cuenta_bancaria" ("principal") WHERE "principal" = true AND "archivedAt" IS NULL;
