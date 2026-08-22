-- AlterTable
ALTER TABLE "notificacion_preferencia" ADD COLUMN     "chat" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "canal_identidad" (
    "id" TEXT NOT NULL,
    "canal" VARCHAR(16) NOT NULL,
    "idExterno" VARCHAR(64) NOT NULL,
    "nombreCanal" VARCHAR(64),
    "clienteId" TEXT,
    "userId" TEXT,
    "verificadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUsoAt" TIMESTAMP(3),
    "revocadoAt" TIMESTAMP(3),

    CONSTRAINT "canal_identidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversacion_estado" (
    "id" TEXT NOT NULL,
    "canal" VARCHAR(16) NOT NULL,
    "idExterno" VARCHAR(64) NOT NULL,
    "paso" VARCHAR(32) NOT NULL,
    "datos" JSONB NOT NULL,
    "expiraAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversacion_estado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canal_evento" (
    "id" TEXT NOT NULL,
    "canal" VARCHAR(16) NOT NULL,
    "eventoExternoId" VARCHAR(128) NOT NULL,
    "idExterno" VARCHAR(64) NOT NULL,
    "tipo" VARCHAR(32) NOT NULL,
    "recibidoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadoAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "canal_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canal_vinculacion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canal" VARCHAR(16) NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "expiraAt" TIMESTAMP(3) NOT NULL,
    "usadoAt" TIMESTAMP(3),
    "revocadoAt" TIMESTAMP(3),
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canal_vinculacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canal_identidad_clienteId_idx" ON "canal_identidad"("clienteId");

-- CreateIndex
CREATE INDEX "canal_identidad_userId_idx" ON "canal_identidad"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "canal_identidad_canal_idExterno_key" ON "canal_identidad"("canal", "idExterno");

-- CreateIndex
CREATE UNIQUE INDEX "conversacion_estado_canal_idExterno_key" ON "conversacion_estado"("canal", "idExterno");

-- CreateIndex
CREATE INDEX "canal_evento_canal_idExterno_recibidoAt_idx" ON "canal_evento"("canal", "idExterno", "recibidoAt");

-- CreateIndex
CREATE UNIQUE INDEX "canal_evento_canal_eventoExternoId_key" ON "canal_evento"("canal", "eventoExternoId");

-- CreateIndex
CREATE UNIQUE INDEX "canal_vinculacion_codigoHash_key" ON "canal_vinculacion"("codigoHash");

-- AddForeignKey
ALTER TABLE "canal_identidad" ADD CONSTRAINT "canal_identidad_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_identidad" ADD CONSTRAINT "canal_identidad_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_vinculacion" ADD CONSTRAINT "canal_vinculacion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint: exactly one principal per external identity (Prisma has no native XOR)
ALTER TABLE "canal_identidad" ADD CONSTRAINT "canal_identidad_un_principal_check"
    CHECK ((("clienteId" IS NOT NULL)::int + ("userId" IS NOT NULL)::int) = 1);
