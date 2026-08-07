-- `IF EXISTS` on both, and the reason is worth writing down because it is a trap that will
-- otherwise be walked into again.
--
-- This migration carries the timestamp `20260806172823` (17:28), but the two indexes it drops are
-- CREATED by `20260806230000_entrego_la_unidad` and `20260806234500_usuarios_de_taller_aliado` —
-- migrations that were hand-written with a chosen time later that same day and therefore sort
-- AFTER this one. On the databases where this ran, they had been applied first and the drops
-- worked. On a clean replay — which is exactly what Prisma's shadow database does on every
-- `migrate dev` — this runs first and drops indexes that do not exist yet, and the whole history
-- becomes impossible to apply to a new database.
--
-- `IF EXISTS` changes nothing anywhere it already succeeded: those indexes were dropped and stay
-- dropped. On a fresh database it is a no-op, and the later migrations then create them.
--
-- **The lesson, for the next migration written by hand: never pick a timestamp.** Use the real
-- clock, or `prisma migrate dev --create-only`, so ordering matches the order things were written.

-- DropIndex
DROP INDEX IF EXISTS "nota_servicio_entregoContactoId_idx";

-- DropIndex
DROP INDEX IF EXISTS "user_tallerId_idx";
