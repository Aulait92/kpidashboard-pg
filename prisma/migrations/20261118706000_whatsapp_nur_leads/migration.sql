-- WhatsApp nur für Leads (Ole, 16.11.2026, Sicherheitsauftrag Coexistence): Assistent und Automatik nur in Chats,
-- die einem Lead aus der Pipeline gehören (lib/whatsapp/nur-leads.ts). Additiv und wiederholbar.

-- 1) Schalter „Assistent auch für neue Kontakte“, Standard aus
ALTER TABLE "AgentConfig" ADD COLUMN IF NOT EXISTS "newContactsBot" BOOLEAN NOT NULL DEFAULT false;

-- 2) Nummern aus der WhatsApp-Business-App (Coexistence: history, smb_app_state_sync). Nur Nummer, kein Verlauf.
CREATE TABLE IF NOT EXISTS "WhatsAppAppContact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppAppContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppAppContact_customerId_phone_key" ON "WhatsAppAppContact"("customerId", "phone");
DO $$ BEGIN
  ALTER TABLE "WhatsAppAppContact" ADD CONSTRAINT "WhatsAppAppContact_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Bestehende Chats ohne Lead: Bisher legte das Gateway jeden unbekannten Kontakt mit botActive = true an.
--    Assistent dort aus, wenn
--      - kein Lead zugeordnet ist (leadId IS NULL),
--      - wir nie etwas geschrieben haben (keine ausgehende Nachricht: weder Assistent, System, Vermittler noch App)
--      - und es nicht das Support-Postfach ist (dort ist der Assistent ohnehin aus).
--    Warum nur diese: Ohne ausgehende Nachricht gab es kein Gespräch, das der Assistent fortsetzt. Kommt der Lead
--    später (Formular nach der ersten Nachricht), schaltet lib/whatsapp/nur-leads.ts (nachLeadZuordnung) den
--    Assistenten beim Zuordnen wieder ein und beantwortet die offene Nachricht. Nichts geht dabei verloren.
--    Chats ohne Lead MIT Verlauf bleiben unverändert (nur gemeldet, siehe unten): Der Assistent antwortet dort
--    trotzdem nicht mehr, weil runBotTurn ohne Lead nicht mehr antwortet (Code, nicht Daten).
--    Wiederholbar: ein zweiter Lauf findet nichts mehr.
UPDATE "Conversation" c
SET "botActive" = false
WHERE c."leadId" IS NULL
  AND c."botActive" = true
  AND c."customerId" <> 'cust_pg_support'
  AND NOT EXISTS (
    SELECT 1 FROM "Message" m WHERE m."conversationId" = c."id" AND m."direction" = 'outbound'
  );

-- 4) Nur melden: Chats ohne Lead, Assistent an, mit ausgehenden Nachrichten (z. B. frühere Antworten des Assistenten
--    an unbekannte Kontakte, Bestandskampagnen, Empfehlungen). Bewusst nicht geändert.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM "Conversation" c
  WHERE c."leadId" IS NULL AND c."botActive" = true AND c."customerId" <> 'cust_pg_support'
    AND EXISTS (SELECT 1 FROM "Message" m WHERE m."conversationId" = c."id" AND m."direction" = 'outbound');
  RAISE NOTICE 'whatsapp_nur_leads: % Chats ohne Lead mit Verlauf und botActive=true (unverändert, Assistent antwortet dort ohne Lead nicht mehr)', n;
END $$;
