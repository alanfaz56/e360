-- AlterTable
ALTER TABLE "producto" ADD COLUMN     "costoReferencia" DECIMAL(12,4);

-- CreateTable
CREATE TABLE "cotizacion_interna" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "notaId" TEXT NOT NULL,
    "mecanicoId" TEXT,
    "cotizacionId" TEXT,
    "estado" VARCHAR(16) NOT NULL DEFAULT 'pendiente',
    "resolucionMotivo" VARCHAR(500),
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creadaPorId" TEXT,
    "resueltaPorId" TEXT,
    "resueltaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizacion_interna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_interna_concepto" (
    "id" TEXT NOT NULL,
    "cotizacionInternaId" TEXT NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "costoUnitario" DECIMAL(12,2) NOT NULL,
    "importe" DECIMAL(12,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "productoId" TEXT,

    CONSTRAINT "cotizacion_interna_concepto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_interna_folio_key" ON "cotizacion_interna"("folio");

-- CreateIndex
CREATE INDEX "cotizacion_interna_notaId_idx" ON "cotizacion_interna"("notaId");

-- CreateIndex
CREATE INDEX "cotizacion_interna_mecanicoId_idx" ON "cotizacion_interna"("mecanicoId");

-- CreateIndex
CREATE INDEX "cotizacion_interna_cotizacionId_idx" ON "cotizacion_interna"("cotizacionId");

-- CreateIndex
CREATE INDEX "cotizacion_interna_estado_idx" ON "cotizacion_interna"("estado");

-- CreateIndex
CREATE INDEX "cotizacion_interna_concepto_cotizacionInternaId_orden_idx" ON "cotizacion_interna_concepto"("cotizacionInternaId", "orden");

-- CreateIndex
CREATE INDEX "cotizacion_interna_concepto_productoId_idx" ON "cotizacion_interna_concepto"("productoId");

-- AddForeignKey
ALTER TABLE "cotizacion_interna" ADD CONSTRAINT "cotizacion_interna_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_interna" ADD CONSTRAINT "cotizacion_interna_mecanicoId_fkey" FOREIGN KEY ("mecanicoId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_interna" ADD CONSTRAINT "cotizacion_interna_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_interna" ADD CONSTRAINT "cotizacion_interna_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_interna" ADD CONSTRAINT "cotizacion_interna_resueltaPorId_fkey" FOREIGN KEY ("resueltaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_interna_concepto" ADD CONSTRAINT "cotizacion_interna_concepto_cotizacionInternaId_fkey" FOREIGN KEY ("cotizacionInternaId") REFERENCES "cotizacion_interna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_interna_concepto" ADD CONSTRAINT "cotizacion_interna_concepto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
