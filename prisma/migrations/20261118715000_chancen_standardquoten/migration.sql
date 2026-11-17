-- Offene Chancen auf „Wachstum“ (Ole, 18.11.2026): Standardquoten Angebot → Abschluss und Termin → Abschluss,
-- solange ein Kunde zu wenige eigene Fälle hat. Additiv.
ALTER TABLE "KpiSettings" ADD COLUMN IF NOT EXISTS "chanceQuoteAngebot" DECIMAL(4,3) NOT NULL DEFAULT 0.4;
ALTER TABLE "KpiSettings" ADD COLUMN IF NOT EXISTS "chanceQuoteTermin" DECIMAL(4,3) NOT NULL DEFAULT 0.25;
