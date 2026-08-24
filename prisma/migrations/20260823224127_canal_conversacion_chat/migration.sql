-- CreateTable
CREATE TABLE "canal_conversacion" (
    "id" TEXT NOT NULL,
    "canal" VARCHAR(16) NOT NULL,
    "idExterno" VARCHAR(64) NOT NULL,
    "nombreCanal" VARCHAR(64),
    "clienteId" TEXT,
    "modo" VARCHAR(16) NOT NULL DEFAULT 'bot',
    "tomadaPorId" TEXT,
    "tomadaAt" TIMESTAMP(3),
    "ultimoMensajeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoMensajeTexto" VARCHAR(280),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canal_conversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canal_mensaje" (
    "id" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "direccion" VARCHAR(10) NOT NULL,
    "texto" TEXT NOT NULL,
    "autorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canal_mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "canal_conversacion_canal_idExterno_key" ON "canal_conversacion"("canal", "idExterno");

-- CreateIndex
CREATE INDEX "canal_mensaje_conversacionId_createdAt_idx" ON "canal_mensaje"("conversacionId", "createdAt");

-- AddForeignKey
ALTER TABLE "canal_conversacion" ADD CONSTRAINT "canal_conversacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_conversacion" ADD CONSTRAINT "canal_conversacion_tomadaPorId_fkey" FOREIGN KEY ("tomadaPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_mensaje" ADD CONSTRAINT "canal_mensaje_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "canal_conversacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_mensaje" ADD CONSTRAINT "canal_mensaje_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
