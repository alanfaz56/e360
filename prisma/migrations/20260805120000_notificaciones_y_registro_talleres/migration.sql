-- AlterTable
ALTER TABLE "nota_servicio" ADD COLUMN     "seguimientoToken" VARCHAR(64);

-- AlterTable
ALTER TABLE "taller" ADD COLUMN     "anosOperando" INTEGER,
ADD COLUMN     "ciudad" VARCHAR(80),
ADD COLUMN     "empleados" INTEGER,
ADD COLUMN     "estado" VARCHAR(16) NOT NULL DEFAULT 'aprobado',
ADD COLUMN     "origen" VARCHAR(16) NOT NULL DEFAULT 'panel',
ADD COLUMN     "revisadoAt" TIMESTAMP(3),
ADD COLUMN     "revisadoPorId" TEXT,
ADD COLUMN     "revisionMotivo" VARCHAR(500),
ADD COLUMN     "rfc" VARCHAR(13),
ADD COLUMN     "sitioWeb" VARCHAR(255);

-- CreateTable
CREATE TABLE "notificacion" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "clienteId" TEXT,
    "evento" VARCHAR(48) NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "cuerpo" VARCHAR(500) NOT NULL,
    "url" VARCHAR(500),
    "entidad" VARCHAR(32),
    "entidadId" TEXT,
    "leidaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_suscripcion" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "clienteId" TEXT,
    "endpoint" VARCHAR(500) NOT NULL,
    "p256dh" VARCHAR(255) NOT NULL,
    "auth" VARCHAR(64) NOT NULL,
    "etiqueta" VARCHAR(80),
    "userAgent" VARCHAR(255),
    "fallos" INTEGER NOT NULL DEFAULT 0,
    "ultimoEnvioAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_suscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion_preferencia" (
    "userId" TEXT NOT NULL,
    "evento" VARCHAR(48) NOT NULL,
    "enApp" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notificacion_preferencia_pkey" PRIMARY KEY ("userId","evento")
);

-- CreateTable
CREATE TABLE "taller_sucursal" (
    "id" TEXT NOT NULL,
    "tallerId" TEXT NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "direccion" VARCHAR(500),
    "ciudad" VARCHAR(80),
    "telefono" VARCHAR(32),
    "contactoNombre" VARCHAR(120),
    "contactoPuesto" VARCHAR(80),
    "contactoTelefono" VARCHAR(32),
    "contactoEmail" VARCHAR(255),
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taller_sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificacion_userId_leidaAt_idx" ON "notificacion"("userId", "leidaAt");

-- CreateIndex
CREATE INDEX "notificacion_clienteId_createdAt_idx" ON "notificacion"("clienteId", "createdAt");

-- CreateIndex
CREATE INDEX "notificacion_entidad_entidadId_idx" ON "notificacion"("entidad", "entidadId");

-- CreateIndex
CREATE UNIQUE INDEX "push_suscripcion_endpoint_key" ON "push_suscripcion"("endpoint");

-- CreateIndex
CREATE INDEX "push_suscripcion_userId_idx" ON "push_suscripcion"("userId");

-- CreateIndex
CREATE INDEX "push_suscripcion_clienteId_idx" ON "push_suscripcion"("clienteId");

-- CreateIndex
CREATE INDEX "taller_sucursal_tallerId_idx" ON "taller_sucursal"("tallerId");

-- CreateIndex
CREATE UNIQUE INDEX "nota_servicio_seguimientoToken_key" ON "nota_servicio"("seguimientoToken");

-- CreateIndex
CREATE INDEX "taller_estado_idx" ON "taller"("estado");

-- AddForeignKey
ALTER TABLE "taller" ADD CONSTRAINT "taller_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_suscripcion" ADD CONSTRAINT "push_suscripcion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_suscripcion" ADD CONSTRAINT "push_suscripcion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion_preferencia" ADD CONSTRAINT "notificacion_preferencia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taller_sucursal" ADD CONSTRAINT "taller_sucursal_tallerId_fkey" FOREIGN KEY ("tallerId") REFERENCES "taller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================================
-- Rules Prisma cannot express. The database is a shared integration surface (Rule 2): another
-- program writing these tables must be held to the same invariants the app is.
-- ============================================================================================

-- A notification is addressed to a staff user OR a customer. Never both — customer copy is
-- deliberately narrower than staff copy and must never reach the wrong inbox — and never
-- neither, which would be a notification nobody can ever read.
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_destinatario_check"
    CHECK (("userId" IS NOT NULL) <> ("clienteId" IS NOT NULL));

ALTER TABLE "push_suscripcion" ADD CONSTRAINT "push_suscripcion_destinatario_check"
    CHECK (("userId" IS NOT NULL) <> ("clienteId" IS NOT NULL));

-- Partner workshop lifecycle.
ALTER TABLE "taller" ADD CONSTRAINT "taller_estado_check"
    CHECK ("estado" IN ('solicitado', 'aprobado', 'rechazado'));

ALTER TABLE "taller" ADD CONSTRAINT "taller_origen_check"
    CHECK ("origen" IN ('panel', 'publico'));

-- Turning a shop down must say why: the reason is what gets read back to them.
ALTER TABLE "taller" ADD CONSTRAINT "taller_rechazo_motivo_check"
    CHECK ("estado" <> 'rechazado' OR "revisionMotivo" IS NOT NULL);

-- At most one head office per workshop. Partial, so archived branches never block a new one.
CREATE UNIQUE INDEX "taller_sucursal_principal_unica"
    ON "taller_sucursal" ("tallerId")
    WHERE "esPrincipal" AND "archivedAt" IS NULL;

-- ============================================================================================
-- Backfill
-- ============================================================================================

-- Every workshop already in the registry was put there by staff, so it is already approved.
-- (Both columns already default to exactly this; the UPDATE is here so the intent is explicit
-- and the migration is correct even if a column default is changed later.)
UPDATE "taller" SET "estado" = 'aprobado', "origen" = 'panel'
WHERE "estado" IS NULL OR "origen" IS NULL;

-- Existing service notes get a follow-along token too, otherwise the tracking link would only
-- ever work for vehicles received after this deploy. 256 bits of randomness, no extension
-- needed: gen_random_uuid() is core since PostgreSQL 13.
UPDATE "nota_servicio"
SET "seguimientoToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "seguimientoToken" IS NULL;

-- Give every workshop a head office row built from what it already had on file, so the branch
-- list is never empty for a shop that plainly has an address.
INSERT INTO "taller_sucursal" (
    "id", "tallerId", "nombre", "direccion", "telefono",
    "contactoNombre", "esPrincipal", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, t."id", 'Matriz', t."direccion", t."telefono",
       t."contacto", true, now(), now()
FROM "taller" t
WHERE NOT EXISTS (SELECT 1 FROM "taller_sucursal" s WHERE s."tallerId" = t."id");
