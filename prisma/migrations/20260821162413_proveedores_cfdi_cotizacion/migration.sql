-- AlterTable
ALTER TABLE "cotizacion_concepto" ADD COLUMN     "entradaId" TEXT;

-- AlterTable
ALTER TABLE "inventario_entrada" ADD COLUMN     "proveedorId" TEXT;

-- CreateTable
CREATE TABLE "proveedor" (
    "id" TEXT NOT NULL,
    "rfc" VARCHAR(13) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "contacto" VARCHAR(120),
    "telefono" VARCHAR(32),
    "email" VARCHAR(160),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor_taller" (
    "proveedorId" TEXT NOT NULL,
    "tallerId" TEXT NOT NULL,
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedor_taller_pkey" PRIMARY KEY ("proveedorId","tallerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_rfc_key" ON "proveedor"("rfc");

-- AddForeignKey
ALTER TABLE "cotizacion_concepto" ADD CONSTRAINT "cotizacion_concepto_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "inventario_entrada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedor_taller" ADD CONSTRAINT "proveedor_taller_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedor_taller" ADD CONSTRAINT "proveedor_taller_tallerId_fkey" FOREIGN KEY ("tallerId") REFERENCES "taller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_entrada" ADD CONSTRAINT "inventario_entrada_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
