-- CreateTable
CREATE TABLE "gasto_categoria" (
    "id" TEXT NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "gasto_categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gasto_plantilla" (
    "id" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "descripcion" VARCHAR(255) NOT NULL,
    "montoDefault" DECIMAL(12,2) NOT NULL,
    "diaMes" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gasto_plantilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gasto" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "plantillaId" TEXT,
    "descripcion" VARCHAR(255) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'confirmado',
    "creadaPorId" TEXT,
    "confirmadaPorId" TEXT,
    "confirmadaAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gasto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gasto_categoria_nombre_key" ON "gasto_categoria"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "gasto_folio_key" ON "gasto"("folio");

-- CreateIndex
CREATE INDEX "gasto_categoriaId_idx" ON "gasto"("categoriaId");

-- CreateIndex
CREATE INDEX "gasto_fecha_idx" ON "gasto"("fecha");

-- CreateIndex
CREATE INDEX "gasto_estado_idx" ON "gasto"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "gasto_plantillaId_fecha_key" ON "gasto"("plantillaId", "fecha");

-- AddForeignKey
ALTER TABLE "gasto_plantilla" ADD CONSTRAINT "gasto_plantilla_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "gasto_categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto_plantilla" ADD CONSTRAINT "gasto_plantilla_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "gasto_categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "gasto_plantilla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_confirmadaPorId_fkey" FOREIGN KEY ("confirmadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Money is never negative, same rule as cotizacion_montos_check/factura_montos_check.
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_monto_check" CHECK ("monto" >= 0);
ALTER TABLE "gasto_plantilla" ADD CONSTRAINT "gasto_plantilla_montoDefault_check" CHECK ("montoDefault" >= 0);
ALTER TABLE "gasto_plantilla" ADD CONSTRAINT "gasto_plantilla_diaMes_check" CHECK ("diaMes" >= 1 AND "diaMes" <= 28);
