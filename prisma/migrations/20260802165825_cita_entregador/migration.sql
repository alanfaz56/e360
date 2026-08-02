-- Who hands the unit over, when it is not the customer themselves. Nullable: a public request
-- exists long before anyone knows this, and plenty of appointments never need one.
--
-- The FK cannot express "must be a contact OF THIS customer holding the entregador role" — that
-- rule lives in `vincularCita` in src/lib/server/citas.ts, which re-checks it whenever the
-- appointment's cliente changes.
ALTER TABLE "cita" ADD COLUMN     "entregadorId" TEXT;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "cliente_contacto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Looked up whenever a contact is edited or removed, to find the appointments pointing at it.
CREATE INDEX "cita_entregadorId_idx" ON "cita"("entregadorId");

-- NOTE: Prisma also proposed `DROP INDEX "cita_fecha_inicio_idx"` here, because that index was
-- written by hand in the citas migration and never declared in schema.prisma. It is the
-- calendar's hot query (everything in this week, in order), so the DROP was removed and the
-- index is now declared on the model instead. Migrations are forward-only — do not re-add it.
