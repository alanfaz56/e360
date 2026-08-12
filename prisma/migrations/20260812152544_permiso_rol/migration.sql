-- CreateTable
CREATE TABLE "permiso_rol" (
    "permiso" VARCHAR(80) NOT NULL,
    "rol" VARCHAR(32) NOT NULL,
    "otorgadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permiso_rol_pkey" PRIMARY KEY ("permiso","rol")
);

-- CreateIndex
CREATE INDEX "permiso_rol_rol_idx" ON "permiso_rol"("rol");

-- AddForeignKey
ALTER TABLE "permiso_rol" ADD CONSTRAINT "permiso_rol_otorgadoPorId_fkey" FOREIGN KEY ("otorgadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
