-- @auch-beim-einmessen
-- Telefonsuche (Ole, 16.11.2026): normalisierte Ziffern-Spalten für alle Nummernfelder, damit jede Schreibweise
-- (+49 152 …, 0049 …, 0152-581 42 143, 015258142143, (0152) …) dieselben Treffer liefert, auch über die Endziffern.
--   "phoneDigits"    = Nummer ohne führende 0 bzw. +49/0049 (wie phoneKey in src/lib/vertrieb/dubletten.ts), z. B. 15258142143
--   "phoneDigitsRev" = dieselben Ziffern rückwärts, B-Tree-Index für die Suche nach Endziffern („42143“)
-- Gepflegt per Trigger (gilt für jeden Schreibweg: App, Sync, Bot, Import). Kein pg_trgm: Erweiterungen auf dem
-- Produktions-Postgres sind nicht geprüft; B-Tree auf Ziffern und umgekehrten Ziffern reicht für Anfang und Ende.
-- Rein additiv und wiederholbar geschrieben (läuft auch beim Einmessen, scripts/migrate.mjs): Funktionen und Trigger
-- stehen nicht im Prisma-Schema. Startwerte der Spalten per SQL; Nummern aus Mail-Signaturen (SalesEmailPhone) trägt
-- die App nach (lib/telefonsuche-server.ts, Cron in kleinen Schritten, idempotent über SalesEmail.phonesIndexedAt).

-- ─── Spalten, Tabelle, Indizes ─────────────────────────────────────────
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "phoneDigits" TEXT, ADD COLUMN IF NOT EXISTS "phoneDigitsRev" TEXT;
ALTER TABLE "Erstinformation" ADD COLUMN IF NOT EXISTS "phoneDigits" TEXT, ADD COLUMN IF NOT EXISTS "phoneDigitsRev" TEXT;
ALTER TABLE "ExistingCustomer" ADD COLUMN IF NOT EXISTS "phoneDigits" TEXT, ADD COLUMN IF NOT EXISTS "phoneDigitsRev" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "phoneDigits" TEXT, ADD COLUMN IF NOT EXISTS "phoneDigitsRev" TEXT;
ALTER TABLE "Onboarding" ADD COLUMN IF NOT EXISTS "phoneDigits" TEXT, ADD COLUMN IF NOT EXISTS "phoneDigitsRev" TEXT;
ALTER TABLE "SalesContact" ADD COLUMN IF NOT EXISTS "phoneDigits" TEXT, ADD COLUMN IF NOT EXISTS "phoneDigitsRev" TEXT;
ALTER TABLE "SalesContactPhone" ADD COLUMN IF NOT EXISTS "phoneDigits" TEXT, ADD COLUMN IF NOT EXISTS "phoneDigitsRev" TEXT;
ALTER TABLE "SalesMeeting" ADD COLUMN IF NOT EXISTS "phoneDigits" TEXT, ADD COLUMN IF NOT EXISTS "phoneDigitsRev" TEXT;
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "phoneDigits" TEXT, ADD COLUMN IF NOT EXISTS "phoneDigitsRev" TEXT;
ALTER TABLE "SalesEmail" ADD COLUMN IF NOT EXISTS "phonesIndexedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "SalesEmailPhone" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FESTNETZ',
    "phoneDigits" TEXT NOT NULL,
    "phoneDigitsRev" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesEmailPhone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SalesEmailPhone_phoneDigits_idx" ON "SalesEmailPhone"("phoneDigits");
CREATE INDEX IF NOT EXISTS "SalesEmailPhone_phoneDigitsRev_idx" ON "SalesEmailPhone"("phoneDigitsRev");
CREATE UNIQUE INDEX IF NOT EXISTS "SalesEmailPhone_emailId_phone_key" ON "SalesEmailPhone"("emailId", "phone");
CREATE INDEX IF NOT EXISTS "Conversation_phoneDigits_idx" ON "Conversation"("phoneDigits");
CREATE INDEX IF NOT EXISTS "Conversation_phoneDigitsRev_idx" ON "Conversation"("phoneDigitsRev");
CREATE INDEX IF NOT EXISTS "ExistingCustomer_phoneDigits_idx" ON "ExistingCustomer"("phoneDigits");
CREATE INDEX IF NOT EXISTS "ExistingCustomer_phoneDigitsRev_idx" ON "ExistingCustomer"("phoneDigitsRev");
CREATE INDEX IF NOT EXISTS "Lead_phoneDigits_idx" ON "Lead"("phoneDigits");
CREATE INDEX IF NOT EXISTS "Lead_phoneDigitsRev_idx" ON "Lead"("phoneDigitsRev");
CREATE INDEX IF NOT EXISTS "SalesContact_phoneDigits_idx" ON "SalesContact"("phoneDigits");
CREATE INDEX IF NOT EXISTS "SalesContact_phoneDigitsRev_idx" ON "SalesContact"("phoneDigitsRev");
CREATE INDEX IF NOT EXISTS "SalesContactPhone_phoneDigits_idx" ON "SalesContactPhone"("phoneDigits");
CREATE INDEX IF NOT EXISTS "SalesContactPhone_phoneDigitsRev_idx" ON "SalesContactPhone"("phoneDigitsRev");
CREATE INDEX IF NOT EXISTS "SalesMeeting_phoneDigits_idx" ON "SalesMeeting"("phoneDigits");
CREATE INDEX IF NOT EXISTS "SalesMeeting_phoneDigitsRev_idx" ON "SalesMeeting"("phoneDigitsRev");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesEmailPhone_emailId_fkey') THEN
    ALTER TABLE "SalesEmailPhone" ADD CONSTRAINT "SalesEmailPhone_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "SalesEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── Normalisierung (gleich wie phoneKey/normalizePhone in TypeScript, geprüft im Integrationstest) ───
-- „+49 (0) 171 …“: die eingeklammerte 0 fällt weg. Mit „+“: international; „00“: international; „0“: deutsch (49).
-- Gültig mit 8 bis 15 Ziffern; Ländervorwahl 49 fällt weg; Ergebnis mindestens 7 Ziffern, sonst NULL.
CREATE OR REPLACE FUNCTION telefon_ziffern(raw text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN length(k) >= 7 THEN k END
  FROM (
    SELECT CASE WHEN p LIKE '49%' THEN substr(p, 3) ELSE p END AS k
    FROM (
      SELECT CASE WHEN length(n) BETWEEN 8 AND 15 THEN n END AS p
      FROM (
        SELECT CASE
          WHEN d = '' THEN NULL
          WHEN t LIKE '+%' THEN d
          WHEN d LIKE '00%' THEN substr(d, 3)
          WHEN d LIKE '0%' THEN '49' || substr(d, 2)
          ELSE d
        END AS n
        FROM (
          SELECT t, regexp_replace(t, '[^0-9]', '', 'g') AS d
          FROM (SELECT regexp_replace(regexp_replace(raw, '\(\s*0\s*\)', ' ', 'g'), '^\s+|\s+$', '', 'g') AS t) a
        ) b
      ) c
    ) e
  ) f
$$;

-- Trigger: Quelle ist die Spalte TG_ARGV[0], optional ein Schlüssel darin (JSON, z. B. websiteInfo → phone).
CREATE OR REPLACE FUNCTION telefonsuche_spalten() RETURNS trigger AS $$
DECLARE
  k text;
BEGIN
  IF TG_NARGS > 1 THEN
    k := telefon_ziffern(to_jsonb(NEW) -> TG_ARGV[0] ->> TG_ARGV[1]);
  ELSE
    k := telefon_ziffern(to_jsonb(NEW) ->> TG_ARGV[0]);
  END IF;
  NEW."phoneDigits" := k;
  NEW."phoneDigitsRev" := reverse(k);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS telefonsuche ON "SalesContact";
CREATE TRIGGER telefonsuche BEFORE INSERT OR UPDATE OF "phone", "phoneDigits", "phoneDigitsRev" ON "SalesContact"
  FOR EACH ROW EXECUTE FUNCTION telefonsuche_spalten('phone');
DROP TRIGGER IF EXISTS telefonsuche ON "SalesContactPhone";
CREATE TRIGGER telefonsuche BEFORE INSERT OR UPDATE OF "phone", "phoneDigits", "phoneDigitsRev" ON "SalesContactPhone"
  FOR EACH ROW EXECUTE FUNCTION telefonsuche_spalten('phone');
DROP TRIGGER IF EXISTS telefonsuche ON "Lead";
CREATE TRIGGER telefonsuche BEFORE INSERT OR UPDATE OF "phone", "phoneDigits", "phoneDigitsRev" ON "Lead"
  FOR EACH ROW EXECUTE FUNCTION telefonsuche_spalten('phone');
DROP TRIGGER IF EXISTS telefonsuche ON "Conversation";
CREATE TRIGGER telefonsuche BEFORE INSERT OR UPDATE OF "contactPhone", "phoneDigits", "phoneDigitsRev" ON "Conversation"
  FOR EACH ROW EXECUTE FUNCTION telefonsuche_spalten('contactPhone');
DROP TRIGGER IF EXISTS telefonsuche ON "SalesMeeting";
CREATE TRIGGER telefonsuche BEFORE INSERT OR UPDATE OF "inviteePhone", "phoneDigits", "phoneDigitsRev" ON "SalesMeeting"
  FOR EACH ROW EXECUTE FUNCTION telefonsuche_spalten('inviteePhone');
DROP TRIGGER IF EXISTS telefonsuche ON "ExistingCustomer";
CREATE TRIGGER telefonsuche BEFORE INSERT OR UPDATE OF "phone", "phoneDigits", "phoneDigitsRev" ON "ExistingCustomer"
  FOR EACH ROW EXECUTE FUNCTION telefonsuche_spalten('phone');
DROP TRIGGER IF EXISTS telefonsuche ON "Erstinformation";
CREATE TRIGGER telefonsuche BEFORE INSERT OR UPDATE OF "telefon", "phoneDigits", "phoneDigitsRev" ON "Erstinformation"
  FOR EACH ROW EXECUTE FUNCTION telefonsuche_spalten('telefon');
DROP TRIGGER IF EXISTS telefonsuche ON "WhatsAppAccount";
CREATE TRIGGER telefonsuche BEFORE INSERT OR UPDATE OF "phoneNumber", "phoneDigits", "phoneDigitsRev" ON "WhatsAppAccount"
  FOR EACH ROW EXECUTE FUNCTION telefonsuche_spalten('phoneNumber');
DROP TRIGGER IF EXISTS telefonsuche ON "Onboarding";
CREATE TRIGGER telefonsuche BEFORE INSERT OR UPDATE OF "websiteInfo", "phoneDigits", "phoneDigitsRev" ON "Onboarding"
  FOR EACH ROW EXECUTE FUNCTION telefonsuche_spalten('websiteInfo', 'phone');
-- SalesEmailPhone wird von der App mit fertigen Ziffern geschrieben, der Trigger sichert dieselbe Form.
DROP TRIGGER IF EXISTS telefonsuche ON "SalesEmailPhone";
CREATE TRIGGER telefonsuche BEFORE INSERT OR UPDATE OF "phone", "phoneDigits", "phoneDigitsRev" ON "SalesEmailPhone"
  FOR EACH ROW EXECUTE FUNCTION telefonsuche_spalten('phone');

-- ─── Startwerte (nur Zeilen, deren Ziffern fehlen oder abweichen; wiederholbar) ───
-- Das UPDATE berührt "phoneDigits", der Trigger oben rechnet dabei beide Spalten aus der Quelle neu.
UPDATE "SalesContact" SET "phoneDigits" = NULL WHERE "phone" IS NOT NULL AND "phoneDigits" IS DISTINCT FROM telefon_ziffern("phone");
UPDATE "SalesContactPhone" SET "phoneDigits" = NULL WHERE "phoneDigits" IS DISTINCT FROM telefon_ziffern("phone");
UPDATE "Lead" SET "phoneDigits" = NULL WHERE "phone" IS NOT NULL AND "phoneDigits" IS DISTINCT FROM telefon_ziffern("phone");
UPDATE "Conversation" SET "phoneDigits" = NULL WHERE "phoneDigits" IS DISTINCT FROM telefon_ziffern("contactPhone");
UPDATE "SalesMeeting" SET "phoneDigits" = NULL WHERE "inviteePhone" IS NOT NULL AND "phoneDigits" IS DISTINCT FROM telefon_ziffern("inviteePhone");
UPDATE "ExistingCustomer" SET "phoneDigits" = NULL WHERE "phone" IS NOT NULL AND "phoneDigits" IS DISTINCT FROM telefon_ziffern("phone");
UPDATE "Erstinformation" SET "phoneDigits" = NULL WHERE "telefon" IS NOT NULL AND "phoneDigits" IS DISTINCT FROM telefon_ziffern("telefon");
UPDATE "WhatsAppAccount" SET "phoneDigits" = NULL WHERE "phoneNumber" IS NOT NULL AND "phoneDigits" IS DISTINCT FROM telefon_ziffern("phoneNumber");
UPDATE "Onboarding" SET "phoneDigits" = NULL WHERE "websiteInfo" IS NOT NULL AND "phoneDigits" IS DISTINCT FROM telefon_ziffern("websiteInfo" ->> 'phone');
