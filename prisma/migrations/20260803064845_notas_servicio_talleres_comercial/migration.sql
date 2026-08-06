-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "diasCredito" INTEGER,
ADD COLUMN     "limiteCredito" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "taller" (
    "id" TEXT NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "telefono" VARCHAR(32),
    "email" VARCHAR(255),
    "contacto" VARCHAR(120),
    "direccion" VARCHAR(500),
    "especialidades" VARCHAR(500),
    "notas" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_servicio" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "citaId" TEXT,
    "clienteId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'recibida',
    "recibidaPorId" TEXT,
    "recibidaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kilometraje" INTEGER,
    "combustibleOctavos" INTEGER,
    "condicion" TEXT,
    "inspeccionAt" TIMESTAMP(3),
    "motivo" TEXT NOT NULL,
    "diagnostico" TEXT,
    "observaciones" TEXT,
    "tallerActualId" TEXT,
    "entregadaAt" TIMESTAMP(3),
    "entregadaAContactoId" TEXT,
    "canceladoMotivo" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nota_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_inventario" (
    "notaId" TEXT NOT NULL,
    "item" VARCHAR(40) NOT NULL,
    "presente" BOOLEAN NOT NULL,
    "notas" VARCHAR(255),

    CONSTRAINT "nota_inventario_pkey" PRIMARY KEY ("notaId","item")
);

-- CreateTable
CREATE TABLE "nota_evidencia" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "tipo" VARCHAR(16) NOT NULL,
    "categoria" VARCHAR(32) NOT NULL,
    "clave" VARCHAR(500) NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "contentType" VARCHAR(120) NOT NULL,
    "bytes" INTEGER,
    "descripcion" VARCHAR(500),
    "subidaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nota_evidencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_comentario" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "interno" BOOLEAN NOT NULL DEFAULT true,
    "autorId" TEXT,
    "autorEmail" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nota_comentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_transferencia" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "tallerId" TEXT NOT NULL,
    "motivo" VARCHAR(500) NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasta" TIMESTAMP(3),
    "resultado" TEXT,
    "enviadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nota_transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidad_kilometraje" (
    "id" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "kilometraje" INTEGER NOT NULL,
    "origen" VARCHAR(16) NOT NULL,
    "medidoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notaId" TEXT,
    "registradoPorId" TEXT,
    "correccion" BOOLEAN NOT NULL DEFAULT false,
    "notas" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidad_kilometraje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "notaId" TEXT NOT NULL,
    "estado" VARCHAR(16) NOT NULL DEFAULT 'borrador',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "iva" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vigenciaHasta" TIMESTAMP(3),
    "notas" TEXT,
    "enviadaAt" TIMESTAMP(3),
    "autorizadaPorContactoId" TEXT,
    "autorizadaMedio" VARCHAR(60),
    "autorizadaAt" TIMESTAMP(3),
    "rechazadaMotivo" VARCHAR(500),
    "creadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_concepto" (
    "id" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "tipo" VARCHAR(16) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "precioUnitario" DECIMAL(12,2) NOT NULL,
    "importe" DECIMAL(12,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cotizacion_concepto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factura" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "notaId" TEXT,
    "clienteId" TEXT NOT NULL,
    "cotizacionId" TEXT,
    "estado" VARCHAR(16) NOT NULL DEFAULT 'borrador',
    "condicionPago" VARCHAR(16) NOT NULL DEFAULT 'contado',
    "diasCredito" INTEGER,
    "vence" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "iva" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "uuid" VARCHAR(36),
    "serie" VARCHAR(25),
    "emitidaAt" TIMESTAMP(3),
    "canceladaAt" TIMESTAMP(3),
    "canceladoMotivo" VARCHAR(255),
    "notas" TEXT,
    "creadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo" VARCHAR(16) NOT NULL,
    "referencia" VARCHAR(120),
    "notas" VARCHAR(500),
    "pagadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registradoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "taller_nombre_idx" ON "taller"("nombre");

-- CreateIndex
CREATE INDEX "taller_archivedAt_idx" ON "taller"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "nota_servicio_folio_key" ON "nota_servicio"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "nota_servicio_citaId_key" ON "nota_servicio"("citaId");

-- CreateIndex
CREATE INDEX "nota_servicio_estado_idx" ON "nota_servicio"("estado");

-- CreateIndex
CREATE INDEX "nota_servicio_clienteId_idx" ON "nota_servicio"("clienteId");

-- CreateIndex
CREATE INDEX "nota_servicio_unidadId_idx" ON "nota_servicio"("unidadId");

-- CreateIndex
CREATE INDEX "nota_servicio_tallerActualId_idx" ON "nota_servicio"("tallerActualId");

-- CreateIndex
CREATE INDEX "nota_servicio_recibidaAt_idx" ON "nota_servicio"("recibidaAt");

-- CreateIndex
CREATE UNIQUE INDEX "nota_evidencia_clave_key" ON "nota_evidencia"("clave");

-- CreateIndex
CREATE INDEX "nota_evidencia_notaId_idx" ON "nota_evidencia"("notaId");

-- CreateIndex
CREATE INDEX "nota_evidencia_categoria_idx" ON "nota_evidencia"("categoria");

-- CreateIndex
CREATE INDEX "nota_comentario_notaId_createdAt_idx" ON "nota_comentario"("notaId", "createdAt");

-- CreateIndex
CREATE INDEX "nota_transferencia_notaId_idx" ON "nota_transferencia"("notaId");

-- CreateIndex
CREATE INDEX "nota_transferencia_tallerId_idx" ON "nota_transferencia"("tallerId");

-- CreateIndex
CREATE INDEX "unidad_kilometraje_unidadId_medidoAt_idx" ON "unidad_kilometraje"("unidadId", "medidoAt");

-- CreateIndex
CREATE INDEX "unidad_kilometraje_notaId_idx" ON "unidad_kilometraje"("notaId");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_folio_key" ON "cotizacion"("folio");

-- CreateIndex
CREATE INDEX "cotizacion_notaId_idx" ON "cotizacion"("notaId");

-- CreateIndex
CREATE INDEX "cotizacion_estado_idx" ON "cotizacion"("estado");

-- CreateIndex
CREATE INDEX "cotizacion_concepto_cotizacionId_orden_idx" ON "cotizacion_concepto"("cotizacionId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "factura_folio_key" ON "factura"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "factura_uuid_key" ON "factura"("uuid");

-- CreateIndex
CREATE INDEX "factura_clienteId_idx" ON "factura"("clienteId");

-- CreateIndex
CREATE INDEX "factura_estado_idx" ON "factura"("estado");

-- CreateIndex
CREATE INDEX "factura_vence_idx" ON "factura"("vence");

-- CreateIndex
CREATE INDEX "pago_facturaId_idx" ON "pago"("facturaId");

-- CreateIndex
CREATE INDEX "pago_pagadoAt_idx" ON "pago"("pagadoAt");

-- AddForeignKey
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_recibidaPorId_fkey" FOREIGN KEY ("recibidaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_tallerActualId_fkey" FOREIGN KEY ("tallerActualId") REFERENCES "taller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_entregadaAContactoId_fkey" FOREIGN KEY ("entregadaAContactoId") REFERENCES "cliente_contacto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_inventario" ADD CONSTRAINT "nota_inventario_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_evidencia" ADD CONSTRAINT "nota_evidencia_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_evidencia" ADD CONSTRAINT "nota_evidencia_subidaPorId_fkey" FOREIGN KEY ("subidaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_comentario" ADD CONSTRAINT "nota_comentario_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_comentario" ADD CONSTRAINT "nota_comentario_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_transferencia" ADD CONSTRAINT "nota_transferencia_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_transferencia" ADD CONSTRAINT "nota_transferencia_tallerId_fkey" FOREIGN KEY ("tallerId") REFERENCES "taller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_transferencia" ADD CONSTRAINT "nota_transferencia_enviadaPorId_fkey" FOREIGN KEY ("enviadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidad_kilometraje" ADD CONSTRAINT "unidad_kilometraje_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidad_kilometraje" ADD CONSTRAINT "unidad_kilometraje_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidad_kilometraje" ADD CONSTRAINT "unidad_kilometraje_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_autorizadaPorContactoId_fkey" FOREIGN KEY ("autorizadaPorContactoId") REFERENCES "cliente_contacto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_concepto" ADD CONSTRAINT "cotizacion_concepto_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura" ADD CONSTRAINT "factura_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura" ADD CONSTRAINT "factura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura" ADD CONSTRAINT "factura_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factura" ADD CONSTRAINT "factura_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written from here down. Prisma cannot express CHECK constraints, and these ARE the
-- contract: the database is a shared integration surface, so an accounting system writing
-- straight into it hits the same rules the app does. See CLAUDE.md Rule 2.
-- ---------------------------------------------------------------------------------------------

-- Vocabulary. Mirrors the registries in src/lib/notas.ts and src/lib/comercial.ts; adding a key
-- there means a migration that widens the matching constraint here.
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_estado_check"
    CHECK ("estado" IN ('recibida','en_diagnostico','en_taller','lista','entregada','cancelada'));

ALTER TABLE "nota_evidencia" ADD CONSTRAINT "nota_evidencia_tipo_check"
    CHECK ("tipo" IN ('foto','documento'));

ALTER TABLE "unidad_kilometraje" ADD CONSTRAINT "unidad_kilometraje_origen_check"
    CHECK ("origen" IN ('nota','alta','manual'));

ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_estado_check"
    CHECK ("estado" IN ('borrador','enviada','autorizada','rechazada','vencida'));

ALTER TABLE "cotizacion_concepto" ADD CONSTRAINT "cotizacion_concepto_tipo_check"
    CHECK ("tipo" IN ('refaccion','mano_obra','insumo','externo'));

ALTER TABLE "factura" ADD CONSTRAINT "factura_estado_check"
    CHECK ("estado" IN ('borrador','emitida','pagada','cancelada'));

ALTER TABLE "factura" ADD CONSTRAINT "factura_condicion_check"
    CHECK ("condicionPago" IN ('contado','credito'));

ALTER TABLE "pago" ADD CONSTRAINT "pago_metodo_check"
    CHECK ("metodo" IN ('efectivo','tarjeta','transferencia','cheque','otro'));

-- The fuel gauge is in eighths, because that is what the needle shows.
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_combustible_check"
    CHECK ("combustibleOctavos" IS NULL OR ("combustibleOctavos" BETWEEN 0 AND 8));

-- An odometer does not run backwards past zero.
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_km_check"
    CHECK ("kilometraje" IS NULL OR "kilometraje" >= 0);
ALTER TABLE "unidad_kilometraje" ADD CONSTRAINT "unidad_kilometraje_valor_check"
    CHECK ("kilometraje" >= 0);

-- Cancelling always says why, and delivering always records when. Both are read back to the
-- customer, so neither may be blank.
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_cancelacion_check"
    CHECK ("estado" <> 'cancelada' OR "canceladoMotivo" IS NOT NULL);
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_entrega_check"
    CHECK ("estado" <> 'entregada' OR "entregadaAt" IS NOT NULL);

-- A note is only "en_taller" while a partner shop actually holds it.
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_taller_check"
    CHECK ("estado" <> 'en_taller' OR "tallerActualId" IS NOT NULL);

-- A transfer that has not come back yet is the open one; it cannot end before it started.
ALTER TABLE "nota_transferencia" ADD CONSTRAINT "nota_transferencia_rango_check"
    CHECK ("hasta" IS NULL OR "hasta" >= "desde");

-- At most ONE open transfer per note: a vehicle is at one partner shop at a time. This is the
-- guard that makes nota_servicio.tallerActualId safe to denormalize.
CREATE UNIQUE INDEX "nota_transferencia_abierta_key"
    ON "nota_transferencia"("notaId") WHERE "hasta" IS NULL;

-- Money is never negative, and totals must actually add up. Catching this in the database means
-- a bad import cannot leave an invoice whose lines disagree with its own total.
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_montos_check"
    CHECK ("subtotal" >= 0 AND "iva" >= 0 AND "total" >= 0 AND "total" = "subtotal" + "iva");
ALTER TABLE "factura" ADD CONSTRAINT "factura_montos_check"
    CHECK ("subtotal" >= 0 AND "iva" >= 0 AND "total" >= 0 AND "total" = "subtotal" + "iva");
ALTER TABLE "cotizacion_concepto" ADD CONSTRAINT "cotizacion_concepto_montos_check"
    CHECK ("cantidad" > 0 AND "precioUnitario" >= 0 AND "importe" >= 0);
ALTER TABLE "pago" ADD CONSTRAINT "pago_monto_check"
    CHECK ("monto" > 0);

-- Credit terms are either both set or both absent — a limit with no term, or a term with no
-- limit, is a half-configured customer nobody can bill correctly.
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_credito_check"
    CHECK (("limiteCredito" IS NULL AND "diasCredito" IS NULL)
        OR ("limiteCredito" IS NOT NULL AND "diasCredito" IS NOT NULL AND "limiteCredito" >= 0 AND "diasCredito" >= 0));

-- A credit invoice must carry its own terms, so changing the customer's limit later never
-- silently rewrites what was already agreed on an issued invoice.
ALTER TABLE "factura" ADD CONSTRAINT "factura_credito_check"
    CHECK ("condicionPago" <> 'credito' OR ("diasCredito" IS NOT NULL AND "vence" IS NOT NULL));

-- The reporting query: "what has this unit run between visits", newest first.
CREATE INDEX "unidad_kilometraje_reporte_idx"
    ON "unidad_kilometraje"("unidadId", "medidoAt" DESC, "kilometraje");
