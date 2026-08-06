-- A partner workshop's own people get accounts.
--
-- Until now `taller` the ROLE (a mechanic on our floor) and `taller` the ENTITY (a shop we source
-- jobs out to) shared a word and nothing else. This column is the one place they touch: it says
-- which outside workshop a mechanic belongs to, so a job transferred to that shop can be worked on
-- by the people who actually have the vehicle.
--
-- Null still means one of ours. That is the default and the safe reading: nothing about an
-- existing account changes.
ALTER TABLE "user" ADD COLUMN "tallerId" TEXT;

ALTER TABLE "user"
    ADD CONSTRAINT "user_tallerId_fkey"
    FOREIGN KEY ("tallerId") REFERENCES "taller"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ONLY a Taller Mecánico may belong to a partner workshop.
--
-- This is not a UI nicety: `tallerId` widens what somebody outside the company can open, and an
-- Operador or Gerente carrying one would be an account with the counter's permissions AND an
-- outside shop's scope. The database refuses it whatever writes to the table.
ALTER TABLE "user" ADD CONSTRAINT "user_taller_solo_rol_taller_check"
    CHECK ("tallerId" IS NULL OR "role" = 'taller');

-- Their whole app is "the notes my shop has". That query filters on this column.
CREATE INDEX "user_tallerId_idx" ON "user"("tallerId");
