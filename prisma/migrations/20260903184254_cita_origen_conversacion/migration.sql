-- AlterTable
ALTER TABLE "cita" ADD COLUMN     "origenConversacionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cita_origenConversacionId_key" ON "cita"("origenConversacionId");

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_origenConversacionId_fkey" FOREIGN KEY ("origenConversacionId") REFERENCES "canal_conversacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
