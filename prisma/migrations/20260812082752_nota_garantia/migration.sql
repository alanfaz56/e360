-- AlterTable
ALTER TABLE "nota_servicio" ADD COLUMN     "garantiaDeId" TEXT;

-- CreateIndex
CREATE INDEX "nota_servicio_garantiaDeId_idx" ON "nota_servicio"("garantiaDeId");

-- AddForeignKey
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_garantiaDeId_fkey" FOREIGN KEY ("garantiaDeId") REFERENCES "nota_servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
