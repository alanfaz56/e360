-- CreateTable
CREATE TABLE "ia_uso" (
    "id" TEXT NOT NULL,
    "proveedor" VARCHAR(16) NOT NULL,
    "modelo" VARCHAR(64) NOT NULL,
    "notaId" TEXT,
    "actorId" TEXT,
    "tokensEntrada" INTEGER NOT NULL,
    "tokensSalida" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ia_uso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ia_uso_proveedor_createdAt_idx" ON "ia_uso"("proveedor", "createdAt");

-- AddForeignKey
ALTER TABLE "ia_uso" ADD CONSTRAINT "ia_uso_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "nota_servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_uso" ADD CONSTRAINT "ia_uso_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
