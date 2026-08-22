-- Widen cita_origen_check: a cita can now also come from the Telegram/WhatsApp bot, not just
-- the public web form ('publico') or the counter ('panel'). See src/lib/server/citas.ts,
-- solicitarCitaPorCanal.
ALTER TABLE "cita" DROP CONSTRAINT "cita_origen_check";

ALTER TABLE "cita" ADD CONSTRAINT "cita_origen_check"
    CHECK ("origen" IN ('publico', 'panel', 'whatsapp', 'telegram'));
