-- AlterTable
ALTER TABLE "cotizacion" ADD COLUMN     "rechazoSolicitadoAt" TIMESTAMP(3),
ADD COLUMN     "rechazoSolicitadoMotivo" VARCHAR(500);
