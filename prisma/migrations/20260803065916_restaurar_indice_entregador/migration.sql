-- Restores the index dropped by 20260802193713_first_up.
--
-- It was written by hand in the cita_entregador migration but never declared on the model, so
-- the next `prisma migrate dev` correctly saw it as drift and proposed the DROP. It is now
-- declared in schema.prisma, which is what stops that from happening again. Migrations are
-- forward-only: the earlier one stays as it is and this one puts the index back.
CREATE INDEX "cita_entregadorId_idx" ON "cita"("entregadorId");
