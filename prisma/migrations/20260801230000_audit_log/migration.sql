-- Generalize the role-change audit into a single append-only audit_log covering every
-- state-changing operation. Existing role_change rows are carried across, not dropped.

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "entity" VARCHAR(64) NOT NULL,
    "entityId" TEXT,
    "entityLabel" VARCHAR(255),
    "actorId" TEXT,
    "actorEmail" VARCHAR(255) NOT NULL,
    "summary" VARCHAR(500),
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "audit_log_entity_entityId_idx" ON "audit_log"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_actorId_idx" ON "audit_log"("actorId");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every historic role change becomes a user.role_change audit entry. The email
-- snapshots are resolved here, while both users still exist.
INSERT INTO "audit_log" (
    "id", "action", "entity", "entityId", "entityLabel",
    "actorId", "actorEmail", "summary", "before", "after", "createdAt"
)
SELECT
    rc."id",
    'user.role_change',
    'user',
    rc."userId",
    target."email",
    rc."actorId",
    COALESCE(actor."email", 'desconocido'),
    COALESCE(target."email", rc."userId") || ': ' || COALESCE(rc."fromRole", 'sin rol') || ' -> ' || rc."toRole",
    jsonb_build_object('role', rc."fromRole"),
    jsonb_build_object('role', rc."toRole"),
    rc."createdAt"
FROM "role_change" rc
LEFT JOIN "user" target ON target."id" = rc."userId"
LEFT JOIN "user" actor ON actor."id" = rc."actorId";

-- DropTable
DROP TABLE "role_change";
