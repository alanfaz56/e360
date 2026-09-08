-- A quote belongs to a customer even before the vehicle has an appointment or enters the shop.
-- Add nullable columns first so the existing rows can be backfilled without inventing records.
ALTER TABLE "cotizacion"
ADD COLUMN "clienteId" TEXT,
ADD COLUMN "unidadId" TEXT,
ADD COLUMN "citaId" TEXT,
ADD COLUMN "seguimientoToken" VARCHAR(64);

UPDATE "cotizacion" AS c
SET
  "clienteId" = n."clienteId",
  "unidadId" = n."unidadId",
  "citaId" = n."citaId"
FROM "nota_servicio" AS n
WHERE c."notaId" = n."id";

ALTER TABLE "cotizacion" ALTER COLUMN "clienteId" SET NOT NULL;

-- The service note used to own the quote and cascade-delete it. It is now an optional later link,
-- so removing that link must preserve the customer-facing commercial document.
ALTER TABLE "cotizacion" DROP CONSTRAINT "cotizacion_notaId_fkey";
ALTER TABLE "cotizacion" ALTER COLUMN "notaId" DROP NOT NULL;

ALTER TABLE "cotizacion"
ADD CONSTRAINT "cotizacion_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "cotizacion_unidadId_fkey"
  FOREIGN KEY ("unidadId") REFERENCES "unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "cotizacion_citaId_fkey"
  FOREIGN KEY ("citaId") REFERENCES "cita"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "cotizacion_notaId_fkey"
  FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "cotizacion_seguimientoToken_key" ON "cotizacion"("seguimientoToken");
CREATE INDEX "cotizacion_clienteId_idx" ON "cotizacion"("clienteId");
CREATE INDEX "cotizacion_unidadId_idx" ON "cotizacion"("unidadId");
CREATE INDEX "cotizacion_citaId_idx" ON "cotizacion"("citaId");
