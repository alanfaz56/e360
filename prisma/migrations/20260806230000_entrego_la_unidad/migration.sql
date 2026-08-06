-- Who physically handed the vehicle over at intake.
--
-- Free text plus an OPTIONAL foreign key, the same shape `cita` already uses for the contact it
-- was booked by. Whoever shows up with the truck is very often the owner's brother-in-law, a
-- driver or a neighbour: a real person the shop needs on the record and who will never be a
-- `cliente_contacto`. Requiring registration here would mean either refusing the vehicle or
-- inventing a contact row nobody maintains.
--
-- The name is stored even when the contact IS registered, so the record still reads after that
-- contact is archived — the same reasoning as `audit_log.entityLabel`.
--
-- All three columns are nullable and have no default: safe to run against a live database, and
-- every note written before this change simply has no answer, which is the truth.
ALTER TABLE "nota_servicio" ADD COLUMN "entregoNombre" VARCHAR(120);
ALTER TABLE "nota_servicio" ADD COLUMN "entregoTelefono" VARCHAR(32);
ALTER TABLE "nota_servicio" ADD COLUMN "entregoContactoId" TEXT;

ALTER TABLE "nota_servicio"
    ADD CONSTRAINT "nota_servicio_entregoContactoId_fkey"
    FOREIGN KEY ("entregoContactoId") REFERENCES "cliente_contacto"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- A named contact must carry its snapshot: a row pointing at a contact with no name recorded
-- would lose who it was the moment that contact is archived, which is the whole point of keeping
-- both columns.
ALTER TABLE "nota_servicio" ADD CONSTRAINT "nota_servicio_entrego_nombre_check"
    CHECK ("entregoContactoId" IS NULL OR "entregoNombre" IS NOT NULL);

CREATE INDEX "nota_servicio_entregoContactoId_idx" ON "nota_servicio"("entregoContactoId");
