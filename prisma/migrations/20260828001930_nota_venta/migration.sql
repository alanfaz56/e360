-- AlterTable
ALTER TABLE "pago" ADD COLUMN     "notaVentaId" TEXT,
ALTER COLUMN "facturaId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "nota_venta" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "notaId" TEXT,
    "clienteId" TEXT NOT NULL,
    "cotizacionId" TEXT,
    "estado" VARCHAR(16) NOT NULL DEFAULT 'activa',
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notas" TEXT,
    "facturaId" TEXT,
    "canceladaAt" TIMESTAMP(3),
    "canceladoMotivo" VARCHAR(255),
    "creadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nota_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_venta_concepto" (
    "id" TEXT NOT NULL,
    "notaVentaId" TEXT NOT NULL,
    "tipo" VARCHAR(16) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "precioUnitario" DECIMAL(12,2) NOT NULL,
    "importe" DECIMAL(12,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "productoId" TEXT,
    "claveProdServ" VARCHAR(8),
    "claveUnidad" VARCHAR(3),

    CONSTRAINT "nota_venta_concepto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nota_venta_folio_key" ON "nota_venta"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "nota_venta_facturaId_key" ON "nota_venta"("facturaId");

-- CreateIndex
CREATE INDEX "nota_venta_notaId_idx" ON "nota_venta"("notaId");

-- CreateIndex
CREATE INDEX "nota_venta_clienteId_idx" ON "nota_venta"("clienteId");

-- CreateIndex
CREATE INDEX "nota_venta_cotizacionId_idx" ON "nota_venta"("cotizacionId");

-- CreateIndex
CREATE INDEX "nota_venta_estado_idx" ON "nota_venta"("estado");

-- CreateIndex
CREATE INDEX "nota_venta_concepto_notaVentaId_idx" ON "nota_venta_concepto"("notaVentaId");

-- CreateIndex
CREATE INDEX "nota_venta_concepto_productoId_idx" ON "nota_venta_concepto"("productoId");

-- CreateIndex
CREATE INDEX "pago_notaVentaId_idx" ON "pago"("notaVentaId");

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_notaVentaId_fkey" FOREIGN KEY ("notaVentaId") REFERENCES "nota_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "factura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_venta_concepto" ADD CONSTRAINT "nota_venta_concepto_notaVentaId_fkey" FOREIGN KEY ("notaVentaId") REFERENCES "nota_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_venta_concepto" ADD CONSTRAINT "nota_venta_concepto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A payment belongs to exactly one of factura or nota_venta, never both, never neither. The two
-- nullable FKs alone can't express that — this is what actually enforces it.
ALTER TABLE "pago" ADD CONSTRAINT "pago_exactamente_un_destino_check"
    CHECK (("facturaId" IS NOT NULL)::int + ("notaVentaId" IS NOT NULL)::int = 1);
