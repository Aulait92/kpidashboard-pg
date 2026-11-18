-- Pakete M4/M6 (E-Mail-Vorlagen): Angaben für die Schritte einer Abfolge, z. B. die fehlenden Unterlagen für die Erinnerung
ALTER TABLE "LeadSequence" ADD COLUMN IF NOT EXISTS "daten" JSONB;
