-- AlterTable
ALTER TABLE "producto" ADD COLUMN     "permiteNegativo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "producto_receta" (
    "id" TEXT NOT NULL,
    "paqueteId" TEXT NOT NULL,
    "componenteId" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_receta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "producto_receta_paqueteId_idx" ON "producto_receta"("paqueteId");

-- CreateIndex
CREATE INDEX "producto_receta_componenteId_idx" ON "producto_receta"("componenteId");

-- CreateIndex
CREATE UNIQUE INDEX "producto_receta_paqueteId_componenteId_key" ON "producto_receta"("paqueteId", "componenteId");

-- AddForeignKey
ALTER TABLE "producto_receta" ADD CONSTRAINT "producto_receta_paqueteId_fkey" FOREIGN KEY ("paqueteId") REFERENCES "producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_receta" ADD CONSTRAINT "producto_receta_componenteId_fkey" FOREIGN KEY ("componenteId") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint
ALTER TABLE "producto" ADD CONSTRAINT "producto_existencia_no_negativa_check"
  CHECK ("existencia" >= 0 OR "permiteNegativo" = true);
