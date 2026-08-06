-- AlterTable
ALTER TABLE "cotizacion" ADD COLUMN     "estadoInterno" VARCHAR(16) NOT NULL DEFAULT 'pendiente';

-- AlterTable
ALTER TABLE "cotizacion_concepto" ADD COLUMN     "claveProdServ" VARCHAR(8),
ADD COLUMN     "claveUnidad" VARCHAR(3),
ADD COLUMN     "productoId" TEXT,
ADD COLUMN     "surtido" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "nota_servicio" ADD COLUMN     "mecanicoId" TEXT,
ADD COLUMN     "trabajoTerminadoAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "producto" (
    "id" TEXT NOT NULL,
    "sku" VARCHAR(40),
    "nombre" VARCHAR(200) NOT NULL,
    "descripcion" VARCHAR(500),
    "tipo" VARCHAR(16) NOT NULL,
    "claveProdServ" VARCHAR(8) NOT NULL,
    "claveUnidad" VARCHAR(3) NOT NULL,
    "unidad" VARCHAR(20) NOT NULL,
    "precioVenta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ivaTasa" DECIMAL(5,4) NOT NULL DEFAULT 0.16,
    "controlaInventario" BOOLEAN NOT NULL DEFAULT true,
    "existencia" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minimo" DECIMAL(12,3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_entrada" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "proveedor" VARCHAR(200),
    "referencia" VARCHAR(120),
    "cfdiUuid" VARCHAR(36),
    "cfdiEmisorRfc" VARCHAR(13),
    "cfdiEmisorNombre" VARCHAR(200),
    "cfdiTotal" DECIMAL(12,2),
    "cfdiFecha" TIMESTAMP(3),
    "cfdiXml" TEXT,
    "notas" TEXT,
    "registradaPorId" TEXT,
    "recibidaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventario_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_capa" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "entradaId" TEXT,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "restante" DECIMAL(12,3) NOT NULL,
    "costoUnitario" DECIMAL(12,4) NOT NULL,
    "recibidaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventario_capa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_movimiento" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "tipo" VARCHAR(16) NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "costoUnitario" DECIMAL(12,4) NOT NULL,
    "costoTotal" DECIMAL(12,2) NOT NULL,
    "capaId" TEXT,
    "entradaId" TEXT,
    "notaId" TEXT,
    "conceptoId" TEXT,
    "motivo" VARCHAR(255),
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventario_movimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_refaccion" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "productoId" TEXT,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "estado" VARCHAR(16) NOT NULL DEFAULT 'pendiente',
    "resolucionMotivo" VARCHAR(500),
    "solicitadaPorId" TEXT,
    "resueltaPorId" TEXT,
    "resueltaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitud_refaccion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "producto_sku_key" ON "producto"("sku");

-- CreateIndex
CREATE INDEX "producto_nombre_idx" ON "producto"("nombre");

-- CreateIndex
CREATE INDEX "producto_tipo_idx" ON "producto"("tipo");

-- CreateIndex
CREATE INDEX "producto_archivedAt_idx" ON "producto"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_entrada_folio_key" ON "inventario_entrada"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_entrada_cfdiUuid_key" ON "inventario_entrada"("cfdiUuid");

-- CreateIndex
CREATE INDEX "inventario_entrada_recibidaAt_idx" ON "inventario_entrada"("recibidaAt");

-- CreateIndex
CREATE INDEX "inventario_capa_productoId_recibidaAt_createdAt_idx" ON "inventario_capa"("productoId", "recibidaAt", "createdAt");

-- CreateIndex
CREATE INDEX "inventario_movimiento_productoId_createdAt_idx" ON "inventario_movimiento"("productoId", "createdAt");

-- CreateIndex
CREATE INDEX "inventario_movimiento_notaId_idx" ON "inventario_movimiento"("notaId");

-- CreateIndex
CREATE INDEX "inventario_movimiento_tipo_idx" ON "inventario_movimiento"("tipo");

-- CreateIndex
CREATE INDEX "solicitud_refaccion_notaId_idx" ON "solicitud_refaccion"("notaId");

-- CreateIndex
CREATE INDEX "solicitud_refaccion_estado_idx" ON "solicitud_refaccion"("estado");

-- CreateIndex
CREATE INDEX "cotizacion_concepto_productoId_idx" ON "cotizacion_concepto"("productoId");

-- CreateIndex
CREATE INDEX "nota_servicio_mecanicoId_idx" ON "nota_servicio"("mecanicoId");

-- AddForeignKey
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_mecanicoId_fkey" FOREIGN KEY ("mecanicoId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_concepto" ADD CONSTRAINT "cotizacion_concepto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_entrada" ADD CONSTRAINT "inventario_entrada_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_capa" ADD CONSTRAINT "inventario_capa_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_capa" ADD CONSTRAINT "inventario_capa_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "inventario_entrada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimiento" ADD CONSTRAINT "inventario_movimiento_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimiento" ADD CONSTRAINT "inventario_movimiento_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "inventario_capa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimiento" ADD CONSTRAINT "inventario_movimiento_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "inventario_entrada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimiento" ADD CONSTRAINT "inventario_movimiento_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimiento" ADD CONSTRAINT "inventario_movimiento_conceptoId_fkey" FOREIGN KEY ("conceptoId") REFERENCES "cotizacion_concepto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimiento" ADD CONSTRAINT "inventario_movimiento_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_refaccion" ADD CONSTRAINT "solicitud_refaccion_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_refaccion" ADD CONSTRAINT "solicitud_refaccion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_refaccion" ADD CONSTRAINT "solicitud_refaccion_solicitadaPorId_fkey" FOREIGN KEY ("solicitadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_refaccion" ADD CONSTRAINT "solicitud_refaccion_resueltaPorId_fkey" FOREIGN KEY ("resueltaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================================
-- Rules Prisma cannot express. The database is a shared integration surface (Rule 2).
-- ============================================================================================

-- Same vocabulary as cotizacion_concepto.tipo, enforced in both places.
ALTER TABLE "producto" ADD CONSTRAINT "producto_tipo_check"
    CHECK ("tipo" IN ('refaccion', 'mano_obra', 'insumo', 'externo'));

-- A SAT ClaveProdServ is exactly 8 digits. Storing a description here instead of the clave is
-- the exact mistake that produced the "value too long for the column's type" bug on clientes.
ALTER TABLE "producto" ADD CONSTRAINT "producto_clave_prodserv_check"
    CHECK ("claveProdServ" ~ '^[0-9]{8}$');

ALTER TABLE "producto" ADD CONSTRAINT "producto_precio_check"
    CHECK ("precioVenta" >= 0 AND "ivaTasa" >= 0 AND "ivaTasa" <= 1);

-- You cannot run out of labour. Anything that controls stock has to be a physical thing.
ALTER TABLE "producto" ADD CONSTRAINT "producto_inventario_fisico_check"
    CHECK (NOT "controlaInventario" OR "tipo" IN ('refaccion', 'insumo'));

-- A layer never holds more than it started with, and never goes negative. This is the invariant
-- the whole FIFO consumption loop turns on.
ALTER TABLE "inventario_capa" ADD CONSTRAINT "inventario_capa_restante_check"
    CHECK ("restante" >= 0 AND "restante" <= "cantidad" AND "cantidad" > 0);

ALTER TABLE "inventario_capa" ADD CONSTRAINT "inventario_capa_costo_check"
    CHECK ("costoUnitario" >= 0);

ALTER TABLE "inventario_movimiento" ADD CONSTRAINT "inventario_movimiento_tipo_check"
    CHECK ("tipo" IN ('entrada', 'salida', 'ajuste'));

-- Always positive: `tipo` carries the direction. A signed quantity AND a type are two sources of
-- truth for one fact, and they drift.
ALTER TABLE "inventario_movimiento" ADD CONSTRAINT "inventario_movimiento_cantidad_check"
    CHECK ("cantidad" > 0);

-- An adjustment with no reason is shrinkage nobody will ever explain.
ALTER TABLE "inventario_movimiento" ADD CONSTRAINT "inventario_ajuste_motivo_check"
    CHECK ("tipo" <> 'ajuste' OR "motivo" IS NOT NULL);

-- Stock leaving always came out of a layer; that is what makes cost of sale reconstructible.
ALTER TABLE "inventario_movimiento" ADD CONSTRAINT "inventario_salida_capa_check"
    CHECK ("tipo" <> 'salida' OR "capaId" IS NOT NULL);

ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_estado_interno_check"
    CHECK ("estadoInterno" IN ('pendiente', 'en_proceso', 'completada', 'por_cobrar', 'cobrada'));

-- The internal track cannot run ahead of the customer. Nothing is "in progress" before they said
-- yes — and the shop having already started is precisely what this stops from becoming invisible.
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_interno_requiere_autorizacion_check"
    CHECK ("estadoInterno" = 'pendiente' OR "estado" = 'autorizada');

ALTER TABLE "cotizacion_concepto" ADD CONSTRAINT "cotizacion_concepto_surtido_check"
    CHECK ("surtido" >= 0);

ALTER TABLE "solicitud_refaccion" ADD CONSTRAINT "solicitud_refaccion_estado_check"
    CHECK ("estado" IN ('pendiente', 'surtida', 'rechazada'));

ALTER TABLE "solicitud_refaccion" ADD CONSTRAINT "solicitud_refaccion_cantidad_check"
    CHECK ("cantidad" > 0);

-- Turning a mechanic down has to say why: it is what they read to know what to do instead.
ALTER TABLE "solicitud_refaccion" ADD CONSTRAINT "solicitud_refaccion_rechazo_check"
    CHECK ("estado" <> 'rechazada' OR "resolucionMotivo" IS NOT NULL);
