-- App-wide settings, and everything a stamped CFDI has to remember.
--
-- Forward-only and safe against a live database: every column added is nullable or has a default,
-- and the new table starts empty. Nothing is backfilled because there is nothing to backfill —
-- no invoice has ever been stamped.

-- ------------------------------------------------------------------------------------------------
-- Ajustes
-- ------------------------------------------------------------------------------------------------
-- `valor` is TEXT: an encrypted secret is base64 of iv + tag + ciphertext and outgrows any VarChar
-- we would pick. `pista` is what the screen shows for a secret, stored separately so displaying
-- one never requires decrypting it.
CREATE TABLE "ajuste" (
    "clave"            VARCHAR(64) PRIMARY KEY,
    "valor"            TEXT,
    "cifrado"          BOOLEAN NOT NULL DEFAULT false,
    "pista"            VARCHAR(32),
    "actualizadoPorId" TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ajuste_actualizadoPorId_fkey"
        FOREIGN KEY ("actualizadoPorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- A secret must carry its hint and a plaintext value must not: the hint is the ONLY thing the
-- screen is allowed to render, so a secret without one would show blank and read as "not set".
ALTER TABLE "ajuste" ADD CONSTRAINT "ajuste_pista_check"
    CHECK (("cifrado" = false AND "pista" IS NULL) OR ("cifrado" = true));

-- ------------------------------------------------------------------------------------------------
-- El receptor vive en el PAC, no aquí
-- ------------------------------------------------------------------------------------------------
-- factura.com identifies a receptor by its own uid, not by RFC, so a customer must exist there
-- before anything can be stamped for them. The environment travels with the uid because a sandbox
-- uid is meaningless in production — without it, switching environments would silently stamp
-- against a receptor that does not exist and the error would name neither.
ALTER TABLE "cliente" ADD COLUMN "facturaComUid"     VARCHAR(64);
ALTER TABLE "cliente" ADD COLUMN "facturaComEntorno" VARCHAR(16);

ALTER TABLE "cliente" ADD CONSTRAINT "cliente_factura_com_entorno_check"
    CHECK ("facturaComEntorno" IS NULL OR "facturaComEntorno" IN ('sandbox', 'produccion'));

-- A uid with no environment beside it cannot be trusted to belong to the one we are pointing at.
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_factura_com_uid_check"
    CHECK ("facturaComUid" IS NULL OR "facturaComEntorno" IS NOT NULL);

-- ------------------------------------------------------------------------------------------------
-- Timbrado y cancelación
-- ------------------------------------------------------------------------------------------------
ALTER TABLE "factura" ADD COLUMN "pacUid"               VARCHAR(64);
ALTER TABLE "factura" ADD COLUMN "pacEntorno"           VARCHAR(16);
ALTER TABLE "factura" ADD COLUMN "timbradaAt"           TIMESTAMP(3);
ALTER TABLE "factura" ADD COLUMN "cancelacionEstatus"   VARCHAR(32);
ALTER TABLE "factura" ADD COLUMN "cancelacionMotivo"    VARCHAR(2);
ALTER TABLE "factura" ADD COLUMN "cancelacionSustituye" VARCHAR(36);

ALTER TABLE "factura" ADD CONSTRAINT "factura_pac_entorno_check"
    CHECK ("pacEntorno" IS NULL OR "pacEntorno" IN ('sandbox', 'produccion'));

-- The four SAT cancellation reasons. `01` is "emitido con errores CON relación" and is the only
-- one that names a replacement, which is why the pair is enforced here and not in app code.
ALTER TABLE "factura" ADD CONSTRAINT "factura_cancelacion_motivo_check"
    CHECK ("cancelacionMotivo" IS NULL OR "cancelacionMotivo" IN ('01', '02', '03', '04'));

ALTER TABLE "factura" ADD CONSTRAINT "factura_cancelacion_sustituye_check"
    CHECK (
        ("cancelacionMotivo" = '01' AND "cancelacionSustituye" IS NOT NULL)
        OR ("cancelacionMotivo" IS DISTINCT FROM '01' AND "cancelacionSustituye" IS NULL)
    );

-- A stamped invoice is a stamped invoice: the SAT's folio fiscal, the PAC's own id and the moment
-- it happened arrive together or not at all. Half of them is a row nobody can reconcile.
ALTER TABLE "factura" ADD CONSTRAINT "factura_timbrado_completo_check"
    CHECK (
        ("uuid" IS NULL AND "pacUid" IS NULL AND "timbradaAt" IS NULL AND "pacEntorno" IS NULL)
        OR ("uuid" IS NOT NULL AND "pacUid" IS NOT NULL AND "timbradaAt" IS NOT NULL AND "pacEntorno" IS NOT NULL)
    );

CREATE INDEX "factura_pacUid_idx" ON "factura" ("pacUid");
