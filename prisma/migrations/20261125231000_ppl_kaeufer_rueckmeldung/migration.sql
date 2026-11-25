-- Rückmeldung des Käufers mit einem Tipp (Pay-per-Lead, Ole 25.11.2026): nur neue, leere Spalten
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "kaeuferRueckmeldung" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "kaeuferRueckmeldungAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "kaeuferRueckmeldungQuelle" TEXT;
