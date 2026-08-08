-- Several phone numbers per customer, one marked principal. `cliente.telefono` stays as the
-- denormalized cache of that principal (same pattern as unidad.kilometraje caching
-- unidad_kilometraje's latest reading) — every existing reader of the column is unaffected.

-- CreateTable
CREATE TABLE "cliente_telefono" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "telefono" VARCHAR(32) NOT NULL,
    "etiqueta" VARCHAR(40),
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_telefono_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cliente_telefono" ADD CONSTRAINT "cliente_telefono_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "cliente_telefono_clienteId_idx" ON "cliente_telefono" ("clienteId");

-- At most one live principal per customer — mirrors taller_sucursal_principal_unica.
CREATE UNIQUE INDEX "cliente_telefono_principal_unica"
    ON "cliente_telefono" ("clienteId")
    WHERE "esPrincipal" AND "archivedAt" IS NULL;

-- Backfill: every customer that already had a phone becomes its own principal row, so nothing
-- captured before this migration is lost.
INSERT INTO "cliente_telefono" ("id", "clienteId", "telefono", "esPrincipal", "createdAt")
SELECT gen_random_uuid()::text, "id", "telefono", true, "createdAt"
FROM "cliente"
WHERE "telefono" IS NOT NULL AND "telefono" <> '';
