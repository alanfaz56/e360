-- DropIndex
DROP INDEX "conversacion_estado_canal_idExterno_key";

-- AlterTable
ALTER TABLE "conversacion_estado" ADD COLUMN     "tipo" VARCHAR(16) NOT NULL DEFAULT 'booking';

-- CreateTable
CREATE TABLE "cliente_verificacion" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "canal" VARCHAR(16) NOT NULL,
    "idExterno" VARCHAR(64) NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "expiraAt" TIMESTAMP(3) NOT NULL,
    "usadoAt" TIMESTAMP(3),
    "revocadoAt" TIMESTAMP(3),
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_verificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cliente_verificacion_codigoHash_key" ON "cliente_verificacion"("codigoHash");

-- CreateIndex
CREATE INDEX "cliente_verificacion_clienteId_idx" ON "cliente_verificacion"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "conversacion_estado_canal_idExterno_tipo_key" ON "conversacion_estado"("canal", "idExterno", "tipo");

-- AddForeignKey
ALTER TABLE "cliente_verificacion" ADD CONSTRAINT "cliente_verificacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

