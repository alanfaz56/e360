-- CreateTable
CREATE TABLE "pago_app_ciclo" (
    "id" TEXT NOT NULL,
    "ciclo" DATE NOT NULL,
    "montoCentavos" BIGINT NOT NULL,
    "clave" VARCHAR(500) NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "contentType" VARCHAR(120) NOT NULL,
    "bytes" INTEGER,
    "subidaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pago_app_ciclo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pago_app_ciclo_ciclo_key" ON "pago_app_ciclo"("ciclo");

-- CreateIndex
CREATE UNIQUE INDEX "pago_app_ciclo_clave_key" ON "pago_app_ciclo"("clave");

-- AddForeignKey
ALTER TABLE "pago_app_ciclo" ADD CONSTRAINT "pago_app_ciclo_subidaPorId_fkey" FOREIGN KEY ("subidaPorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
