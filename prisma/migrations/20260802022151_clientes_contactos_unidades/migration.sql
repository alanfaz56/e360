-- CreateTable
CREATE TABLE "cliente" (
    "id" TEXT NOT NULL,
    "tipo" VARCHAR(16) NOT NULL,
    "nombre" VARCHAR(120),
    "apellidos" VARCHAR(120),
    "razonSocial" VARCHAR(200),
    "nombreCompleto" VARCHAR(255) NOT NULL,
    "telefono" VARCHAR(32),
    "email" VARCHAR(255),
    "direccion" VARCHAR(500),
    "notas" TEXT,
    "rfc" VARCHAR(13),
    "regimenFiscal" VARCHAR(8),
    "codigoPostal" VARCHAR(5),
    "usoCfdi" VARCHAR(8),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_contacto" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "telefono" VARCHAR(32),
    "email" VARCHAR(255),
    "identificacion" VARCHAR(120),
    "notas" TEXT,
    "roles" VARCHAR(32)[],
    "alcanceUnidades" VARCHAR(16) NOT NULL DEFAULT 'todas',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_contacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacto_unidad" (
    "contactoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,

    CONSTRAINT "contacto_unidad_pkey" PRIMARY KEY ("contactoId","unidadId")
);

-- CreateTable
CREATE TABLE "unidad" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "marca" VARCHAR(60) NOT NULL,
    "modelo" VARCHAR(60) NOT NULL,
    "anio" INTEGER,
    "color" VARCHAR(40),
    "placas" VARCHAR(16),
    "vin" VARCHAR(24),
    "numeroEconomico" VARCHAR(32),
    "kilometraje" INTEGER,
    "notas" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidad_propietario" (
    "id" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasta" TIMESTAMP(3),
    "motivo" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidad_propietario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cliente_nombreCompleto_idx" ON "cliente"("nombreCompleto");

-- CreateIndex
CREATE INDEX "cliente_rfc_idx" ON "cliente"("rfc");

-- CreateIndex
CREATE INDEX "cliente_archivedAt_idx" ON "cliente"("archivedAt");

-- CreateIndex
CREATE INDEX "cliente_contacto_clienteId_idx" ON "cliente_contacto"("clienteId");

-- CreateIndex
CREATE INDEX "cliente_contacto_archivedAt_idx" ON "cliente_contacto"("archivedAt");

-- CreateIndex
CREATE INDEX "contacto_unidad_unidadId_idx" ON "contacto_unidad"("unidadId");

-- CreateIndex
CREATE UNIQUE INDEX "unidad_vin_key" ON "unidad"("vin");

-- CreateIndex
CREATE INDEX "unidad_clienteId_idx" ON "unidad"("clienteId");

-- CreateIndex
CREATE INDEX "unidad_placas_idx" ON "unidad"("placas");

-- CreateIndex
CREATE INDEX "unidad_numeroEconomico_idx" ON "unidad"("numeroEconomico");

-- CreateIndex
CREATE INDEX "unidad_archivedAt_idx" ON "unidad"("archivedAt");

-- CreateIndex
CREATE INDEX "unidad_propietario_unidadId_idx" ON "unidad_propietario"("unidadId");

-- CreateIndex
CREATE INDEX "unidad_propietario_clienteId_idx" ON "unidad_propietario"("clienteId");

-- AddForeignKey
ALTER TABLE "cliente_contacto" ADD CONSTRAINT "cliente_contacto_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacto_unidad" ADD CONSTRAINT "contacto_unidad_contactoId_fkey" FOREIGN KEY ("contactoId") REFERENCES "cliente_contacto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacto_unidad" ADD CONSTRAINT "contacto_unidad_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidad" ADD CONSTRAINT "unidad_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidad_propietario" ADD CONSTRAINT "unidad_propietario_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidad_propietario" ADD CONSTRAINT "unidad_propietario_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints Prisma cannot express. The database is a shared integration
-- surface (CLAUDE.md Rule 2) — these invariants must hold even for a writer
-- that is not this application.
-- ---------------------------------------------------------------------------

-- A customer is a person or an organization, and carries the name fields for its type.
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_tipo_check"
    CHECK ("tipo" IN ('persona', 'organizacion'));

ALTER TABLE "cliente" ADD CONSTRAINT "cliente_nombre_por_tipo_check"
    CHECK (
        ("tipo" = 'persona'      AND "nombre" IS NOT NULL)
     OR ("tipo" = 'organizacion' AND "razonSocial" IS NOT NULL)
    );

-- Contact roles must be known keys. Mirrors CONTACTO_ROLES in src/lib/contacto-roles.ts;
-- update both together.
ALTER TABLE "cliente_contacto" ADD CONSTRAINT "cliente_contacto_roles_check"
    CHECK ("roles" <@ ARRAY['entregador','autorizador','facturacion','general']::VARCHAR(32)[]);

ALTER TABLE "cliente_contacto" ADD CONSTRAINT "cliente_contacto_alcance_check"
    CHECK ("alcanceUnidades" IN ('todas', 'especificas'));

-- An ownership period cannot end before it starts.
ALTER TABLE "unidad_propietario" ADD CONSTRAINT "unidad_propietario_rango_check"
    CHECK ("hasta" IS NULL OR "hasta" >= "desde");

-- A unit has AT MOST ONE current owner. This is the invariant that keeps
-- unidad."clienteId" and the open history row from drifting apart: a transfer that
-- forgets to close the previous period fails loudly instead of silently duplicating.
CREATE UNIQUE INDEX "unidad_propietario_actual_key"
    ON "unidad_propietario"("unidadId") WHERE "hasta" IS NULL;
