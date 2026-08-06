-- AlterTable
ALTER TABLE "nota_transferencia" ADD COLUMN     "qaAt" TIMESTAMP(3),
ADD COLUMN     "qaNotas" TEXT,
ADD COLUMN     "qaPorId" TEXT,
ADD COLUMN     "qaResultado" VARCHAR(16);

-- AddForeignKey
ALTER TABLE "nota_transferencia" ADD CONSTRAINT "nota_transferencia_qaPorId_fkey" FOREIGN KEY ("qaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written. QA on receiving a unit back from a partner workshop: Estación 360 is who the
-- customer holds responsible for the repair, so accepting the work back is a decision with a
-- name and a timestamp on it — never a status that flips because the truck showed up.
-- ---------------------------------------------------------------------------------------------

-- Backfill BEFORE tightening: transfers that were already closed predate this step, so they get
-- a retroactive verdict rather than making the migration unrunnable against live data. Forward-
-- only and safe to replay — the WHERE clause makes it a no-op the second time.
UPDATE "nota_transferencia"
SET "qaResultado" = 'aprobado',
    "qaAt" = "hasta",
    "qaNotas" = COALESCE("qaNotas", 'Recepción anterior al control de calidad. Aprobada retroactivamente por la migración.')
WHERE "hasta" IS NOT NULL AND "qaResultado" IS NULL;

-- Mirrors QA_RESULTADOS in src/lib/notas.ts. `no_aplica` is the one nobody can pick: it is set
-- when a note is cancelled while the unit is still out, so the transfer can close honestly
-- instead of recording a quality check that never happened.
ALTER TABLE "nota_transferencia" ADD CONSTRAINT "nota_transferencia_qa_check"
    CHECK ("qaResultado" IS NULL OR "qaResultado" IN ('aprobado','con_detalles','rechazado','no_aplica'));

-- A verdict with no timestamp is not a sign-off. `qaPorId` is deliberately NOT required here:
-- it is onDelete SetNull, so requiring it would mean deleting a user could violate this
-- constraint on rows nobody touched. WHO is a snapshot in the audit trail; WHEN is the fact.
ALTER TABLE "nota_transferencia" ADD CONSTRAINT "nota_transferencia_qa_completo_check"
    CHECK ("qaResultado" IS NULL OR "qaAt" IS NOT NULL);

-- Rejecting the work has to say WHY, or the partner shop has nothing to act on and the next
-- reviewer has nothing to compare against.
ALTER TABLE "nota_transferencia" ADD CONSTRAINT "nota_transferencia_qa_motivo_check"
    CHECK ("qaResultado" <> 'rechazado' OR "qaNotas" IS NOT NULL);

-- A CLOSED transfer must carry its verdict: the unit came back, so somebody reviewed it. Open
-- transfers (still at the shop) have no verdict yet, which is why this is conditional on `hasta`.
ALTER TABLE "nota_transferencia" ADD CONSTRAINT "nota_transferencia_cerrada_qa_check"
    CHECK ("hasta" IS NULL OR "qaResultado" IS NOT NULL);

-- Pending QA is the list the shop actually works from.
CREATE INDEX "nota_transferencia_qa_idx" ON "nota_transferencia"("qaResultado");
