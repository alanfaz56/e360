-- "Liberación 360": the 15-point pre-delivery checklist. `nota_servicio.unidadLiberada` is the
-- checklist's own verdict (null = not filled yet); `nota_liberacion` holds the 15 individual
-- answers behind it. `entregarNota` refuses to move a note to `entregada` unless
-- `unidadLiberada = true`.

-- AlterTable
ALTER TABLE "nota_servicio" ADD COLUMN     "liberacionAt" TIMESTAMP(3),
ADD COLUMN     "liberadaPorId" TEXT,
ADD COLUMN     "observacionesLiberacion" TEXT,
ADD COLUMN     "unidadLiberada" BOOLEAN;

-- CreateTable
CREATE TABLE "nota_liberacion" (
    "notaId" TEXT NOT NULL,
    "item" VARCHAR(40) NOT NULL,
    "respuesta" VARCHAR(4) NOT NULL,
    "notas" VARCHAR(255),

    CONSTRAINT "nota_liberacion_pkey" PRIMARY KEY ("notaId","item")
);

-- Manual follow-ups: "call this customer on this date about this vehicle." `hecho`/`fecha` are
-- the only state — overdue is computed at read time (!hecho && fecha < hoy()), never stored.
-- CreateTable
CREATE TABLE "recordatorio" (
    "id" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "notaId" TEXT,
    "motivo" VARCHAR(500) NOT NULL,
    "fecha" DATE NOT NULL,
    "hecho" BOOLEAN NOT NULL DEFAULT false,
    "hechoAt" TIMESTAMP(3),
    "hechoPorId" TEXT,
    "creadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordatorio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recordatorio_fecha_idx" ON "recordatorio"("fecha");

-- CreateIndex
CREATE INDEX "recordatorio_unidadId_idx" ON "recordatorio"("unidadId");

-- CreateIndex
CREATE INDEX "recordatorio_hecho_idx" ON "recordatorio"("hecho");

-- AddForeignKey
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_liberadaPorId_fkey" FOREIGN KEY ("liberadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_liberacion" ADD CONSTRAINT "nota_liberacion_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorio" ADD CONSTRAINT "recordatorio_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorio" ADD CONSTRAINT "recordatorio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorio" ADD CONSTRAINT "recordatorio_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorio" ADD CONSTRAINT "recordatorio_hechoPorId_fkey" FOREIGN KEY ("hechoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorio" ADD CONSTRAINT "recordatorio_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
