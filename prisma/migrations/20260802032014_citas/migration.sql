-- CreateTable
CREATE TABLE "cita" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "origen" VARCHAR(16) NOT NULL,
    "estado" VARCHAR(16) NOT NULL DEFAULT 'solicitada',
    "tipo" VARCHAR(16) NOT NULL,
    "fecha" DATE NOT NULL,
    "franja" VARCHAR(8),
    "inicio" TIMESTAMPTZ(6),
    "fin" TIMESTAMPTZ(6),
    "nombre" VARCHAR(120) NOT NULL,
    "telefono" VARCHAR(32) NOT NULL,
    "email" VARCHAR(255),
    "marca" VARCHAR(60),
    "modelo" VARCHAR(60),
    "anio" INTEGER,
    "placas" VARCHAR(16),
    "motivo" TEXT NOT NULL,
    "notas" TEXT,
    "clienteId" TEXT,
    "unidadId" TEXT,
    "direccionRecoleccion" VARCHAR(500),
    "asignadoId" TEXT,
    "canceladoMotivo" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cita_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cita_folio_key" ON "cita"("folio");

-- CreateIndex
CREATE INDEX "cita_fecha_idx" ON "cita"("fecha");

-- CreateIndex
CREATE INDEX "cita_inicio_idx" ON "cita"("inicio");

-- CreateIndex
CREATE INDEX "cita_estado_idx" ON "cita"("estado");

-- CreateIndex
CREATE INDEX "cita_asignadoId_idx" ON "cita"("asignadoId");

-- CreateIndex
CREATE INDEX "cita_clienteId_idx" ON "cita"("clienteId");

-- CreateIndex
CREATE INDEX "cita_telefono_idx" ON "cita"("telefono");

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_asignadoId_fkey" FOREIGN KEY ("asignadoId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written from here down. Prisma cannot express CHECK constraints, and these ARE the
-- contract: the database is a shared integration surface, so another program writing straight
-- into it must hit the same rules the app does. See CLAUDE.md Rule 2.
-- ---------------------------------------------------------------------------------------------

-- Vocabulary. Mirrors CITA_ESTADOS / CITA_TIPOS / FRANJAS in src/lib/citas.ts; adding a key
-- there means a migration that widens the matching constraint here.
ALTER TABLE "cita" ADD CONSTRAINT "cita_estado_check"
    CHECK ("estado" IN ('solicitada','confirmada','en_proceso','completada','cancelada','no_asistio'));

ALTER TABLE "cita" ADD CONSTRAINT "cita_tipo_check"
    CHECK ("tipo" IN ('en_sitio','recoleccion'));

ALTER TABLE "cita" ADD CONSTRAINT "cita_origen_check"
    CHECK ("origen" IN ('publico','panel'));

ALTER TABLE "cita" ADD CONSTRAINT "cita_franja_check"
    CHECK ("franja" IS NULL OR "franja" IN ('manana','tarde'));

-- A request may still be waiting for an hour, and a cancelled one never got one. Anything the
-- shop has actually accepted must be placeable on the calendar.
ALTER TABLE "cita" ADD CONSTRAINT "cita_inicio_requerido_check"
    CHECK ("estado" IN ('solicitada','cancelada') OR "inicio" IS NOT NULL);

ALTER TABLE "cita" ADD CONSTRAINT "cita_rango_check"
    CHECK ("fin" IS NULL OR "inicio" IS NULL OR "fin" > "inicio");

-- Sending someone to collect a vehicle without an address is not a real appointment.
ALTER TABLE "cita" ADD CONSTRAINT "cita_recoleccion_direccion_check"
    CHECK ("tipo" <> 'recoleccion' OR "direccionRecoleccion" IS NOT NULL);

-- Cancelling always says why. The reason is read back to the customer on the phone.
ALTER TABLE "cita" ADD CONSTRAINT "cita_cancelacion_motivo_check"
    CHECK ("estado" <> 'cancelada' OR "canceladoMotivo" IS NOT NULL);

-- The calendar's hot query is "everything in this week, in order".
CREATE INDEX "cita_fecha_inicio_idx" ON "cita"("fecha", "inicio");
