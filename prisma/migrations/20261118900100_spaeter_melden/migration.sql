-- „Später melden“ am Kontakt (Ole, 18.11.2026): Pause der automatischen Nachrichten bis zu einem Tag, danach geht es von
-- selbst weiter (Lead.nachrichtenPausiertBis; ohne Wert wie bisher bis „Fortsetzen“). Nur eine neue Spalte.
ALTER TABLE "Lead" ADD COLUMN "nachrichtenPausiertBis" TIMESTAMP(3);
CREATE INDEX "Lead_nachrichtenPausiertBis_idx" ON "Lead"("nachrichtenPausiertBis");
