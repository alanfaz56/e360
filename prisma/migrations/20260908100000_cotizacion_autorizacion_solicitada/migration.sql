-- A public-link click records intent only. An authenticated employee still confirms the approval
-- through the existing state transition and its contact, permission and audit checks.
ALTER TABLE "cotizacion" ADD COLUMN "autorizacionSolicitadaAt" TIMESTAMP(3);
