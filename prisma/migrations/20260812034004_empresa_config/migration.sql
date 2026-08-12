-- CreateTable
CREATE TABLE "empresa_config" (
    "id" TEXT NOT NULL,
    "telefono" VARCHAR(20),
    "sitioWeb" VARCHAR(200),
    "actualizadoPorId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresa_config_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "empresa_config" ADD CONSTRAINT "empresa_config_actualizadoPorId_fkey" FOREIGN KEY ("actualizadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
