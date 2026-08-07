-- Three changes, all additive and safe against a live database.
--
-- 1. An invoice keeps its OWN line items, so it can be stamped without a quote behind it.
-- 2. A workshop can be ours (`esInterno`), so assigning work is always "to a taller".
-- 3. A comment can carry files, reusing the evidence table rather than a parallel one.

-- ------------------------------------------------------------------------------------------------
-- 1. Conceptos de la factura
-- ------------------------------------------------------------------------------------------------
-- COPIED at issue, never read back through the quote: re-quoting or re-classifying a product next
-- year must not rewrite what was already invoiced. Same reasoning as copying the credit terms.
CREATE TABLE "factura_concepto" (
    "id"             TEXT PRIMARY KEY,
    "facturaId"      TEXT NOT NULL,
    "tipo"           VARCHAR(16) NOT NULL,
    "descripcion"    VARCHAR(500) NOT NULL,
    "cantidad"       DECIMAL(10, 2) NOT NULL,
    "precioUnitario" DECIMAL(12, 2) NOT NULL,
    "importe"        DECIMAL(12, 2) NOT NULL,
    "orden"          INTEGER NOT NULL DEFAULT 0,
    "productoId"     TEXT,
    "claveProdServ"  VARCHAR(8),
    "claveUnidad"    VARCHAR(3),

    CONSTRAINT "factura_concepto_facturaId_fkey"
        FOREIGN KEY ("facturaId") REFERENCES "factura"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "factura_concepto_productoId_fkey"
        FOREIGN KEY ("productoId") REFERENCES "producto"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "factura_concepto_facturaId_idx"  ON "factura_concepto" ("facturaId");
CREATE INDEX "factura_concepto_productoId_idx" ON "factura_concepto" ("productoId");

-- The same vocabulary as a quote line — one list, so a concepto means the same thing on both.
ALTER TABLE "factura_concepto" ADD CONSTRAINT "factura_concepto_tipo_check"
    CHECK ("tipo" IN ('refaccion', 'mano_obra', 'insumo', 'externo'));

-- A line that charges nothing or a negative amount is a data-entry error, not a discount: a
-- discount is its own CFDI field and this is not it.
ALTER TABLE "factura_concepto" ADD CONSTRAINT "factura_concepto_cantidad_check"
    CHECK ("cantidad" > 0);
ALTER TABLE "factura_concepto" ADD CONSTRAINT "factura_concepto_precio_check"
    CHECK ("precioUnitario" >= 0 AND "importe" >= 0);

-- 8 digits exactly, like `producto_clave_prodserv_check`. Claves, never labels.
ALTER TABLE "factura_concepto" ADD CONSTRAINT "factura_concepto_clave_prodserv_check"
    CHECK ("claveProdServ" IS NULL OR "claveProdServ" ~ '^[0-9]{8}$');

-- Backfill: every invoice issued from a quote gets the quote's lines, so nothing already on file
-- is left unstampable. An ad-hoc invoice has none — its lines were never stored anywhere and
-- cannot be invented.
INSERT INTO "factura_concepto" (
    "id", "facturaId", "tipo", "descripcion", "cantidad", "precioUnitario", "importe", "orden",
    "productoId", "claveProdServ", "claveUnidad"
)
SELECT
    gen_random_uuid()::text, f."id", c."tipo", c."descripcion", c."cantidad", c."precioUnitario",
    c."importe", c."orden", c."productoId", c."claveProdServ", c."claveUnidad"
FROM "factura" f
JOIN "cotizacion_concepto" c ON c."cotizacionId" = f."cotizacionId"
WHERE f."cotizacionId" IS NOT NULL;

-- ------------------------------------------------------------------------------------------------
-- 2. El taller interno
-- ------------------------------------------------------------------------------------------------
-- Work is always assigned TO A TALLER, including our own bay. That is what replaces assigning an
-- individual mechanic: a note that stays in-house takes the same path as one that goes out, and
-- the mechanics who touch it are scoped by `user.tallerId` like everybody else.
ALTER TABLE "taller" ADD COLUMN "esInterno" BOOLEAN NOT NULL DEFAULT false;

-- Our own bay is not something that applies to be certified, and it cannot be rejected — it IS the
-- shop. A `solicitado` or `rechazado` internal workshop is a state with no meaning.
ALTER TABLE "taller" ADD CONSTRAINT "taller_interno_aprobado_check"
    CHECK ("esInterno" = false OR "estado" = 'aprobado');

CREATE INDEX "taller_esInterno_idx" ON "taller" ("esInterno");

-- ------------------------------------------------------------------------------------------------
-- 3. Adjuntos en los comentarios
-- ------------------------------------------------------------------------------------------------
-- An attachment IS an evidence row: same bucket, same signer, same prefix check, same audit. A
-- parallel `nota_comentario_adjunto` would be a second upload path to keep in step, and the first
-- thing to drift would be which content types are allowed.
ALTER TABLE "nota_evidencia" ADD COLUMN "comentarioId" TEXT;

ALTER TABLE "nota_evidencia" ADD CONSTRAINT "nota_evidencia_comentarioId_fkey"
    FOREIGN KEY ("comentarioId") REFERENCES "nota_comentario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "nota_evidencia_comentarioId_idx" ON "nota_evidencia" ("comentarioId");

-- `tipo` gains audio and video. Voice notes are how somebody in the bay with greasy hands actually
-- reports a fault, and a ten-second clip of a noise says what a paragraph cannot.
ALTER TABLE "nota_evidencia" DROP CONSTRAINT IF EXISTS "nota_evidencia_tipo_check";
ALTER TABLE "nota_evidencia" ADD CONSTRAINT "nota_evidencia_tipo_check"
    CHECK ("tipo" IN ('foto', 'documento', 'audio', 'video'));
