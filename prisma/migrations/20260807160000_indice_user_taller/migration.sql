-- Restore the index on `user.tallerId`, which `full_integration` dropped by mistake.
--
-- It is USED: `alcanceDeTaller` and `mecanicosDeTaller` both query `user WHERE tallerId = …`, and
-- that query is the boundary deciding which service notes a partner shop's mechanic may open at
-- all. It was dropped because the schema never declared it, so `migrate diff` read it as drift —
-- an index the database has and the schema does not is exactly that. The schema declares it now,
-- which is what stops the same DROP being emitted again.
--
-- `IF NOT EXISTS` because the databases this runs against are in three different states: one
-- where it was created and then dropped, one where it never existed, and — after the ordering fix
-- in `full_integration` — a clean replay where the later migration creates it before this runs.
-- All three end up the same.
--
CREATE INDEX IF NOT EXISTS "user_tallerId_idx" ON "user" ("tallerId");

-- And the other half: `nota_servicio_entregoContactoId_idx` goes for good.
--
-- Nothing queries notes by who handed the vehicle over, and an index nobody reads only costs
-- writes. If a "what did this contact bring in" screen ever exists, that is when it earns its
-- place back.
--
-- It has to be dropped HERE rather than left to the no-op'd drop in `full_integration`, because
-- after the ordering fix that drop runs BEFORE `entrego_la_unidad` creates it — so a fresh
-- database would end up holding an index the schema does not declare, which is the exact drift
-- that produced this whole mess. Three different starting states, one ending state.
DROP INDEX IF EXISTS "nota_servicio_entregoContactoId_idx";
