-- CreateTable
CREATE TABLE "nota_reporte_ia" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "generadoPorId" TEXT,
    "proveedor" VARCHAR(16) NOT NULL,
    "modelo" VARCHAR(64) NOT NULL,
    "estadoNota" VARCHAR(16) NOT NULL,
    "narrativa" TEXT NOT NULL,
    "fotos" JSONB NOT NULL,
    "cotizaciones" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nota_reporte_ia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nota_reporte_ia_notaId_createdAt_idx" ON "nota_reporte_ia"("notaId", "createdAt");

-- AddForeignKey
ALTER TABLE "nota_reporte_ia" ADD CONSTRAINT "nota_reporte_ia_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_reporte_ia" ADD CONSTRAINT "nota_reporte_ia_generadoPorId_fkey" FOREIGN KEY ("generadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
