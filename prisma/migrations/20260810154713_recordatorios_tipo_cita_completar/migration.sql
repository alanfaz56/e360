-- AlterTable
ALTER TABLE "cita" ADD COLUMN     "completadoSinNotaMotivo" VARCHAR(255);

-- AlterTable
ALTER TABLE "recordatorio" ADD COLUMN     "citaId" TEXT,
ADD COLUMN     "tipo" VARCHAR(20) NOT NULL DEFAULT 'otro';

-- CreateIndex
CREATE INDEX "recordatorio_citaId_idx" ON "recordatorio"("citaId");

-- AddForeignKey
ALTER TABLE "recordatorio" ADD CONSTRAINT "recordatorio_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;
