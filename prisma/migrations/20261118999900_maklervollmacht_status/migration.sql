-- Maklervollmacht (18.11.2026): Versandstatus der Kopie an den Kunden und „Schreiben gesendet“ je Versicherer. Additiv.
ALTER TABLE "Maklervollmacht" ADD COLUMN IF NOT EXISTS "kopieStatus" TEXT;
ALTER TABLE "Maklervollmacht" ADD COLUMN IF NOT EXISTS "kopieAt" TIMESTAMP(3);
ALTER TABLE "Maklervollmacht" ADD COLUMN IF NOT EXISTS "uebertragung" JSONB;
