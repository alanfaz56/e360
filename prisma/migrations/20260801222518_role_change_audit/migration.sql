-- CreateTable
CREATE TABLE "role_change" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromRole" VARCHAR(32),
    "toRole" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_change_userId_idx" ON "role_change"("userId");

-- CreateIndex
CREATE INDEX "role_change_createdAt_idx" ON "role_change"("createdAt");

-- AddForeignKey
ALTER TABLE "role_change" ADD CONSTRAINT "role_change_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_change" ADD CONSTRAINT "role_change_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
