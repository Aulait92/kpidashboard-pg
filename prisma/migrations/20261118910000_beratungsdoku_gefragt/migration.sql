-- Beratungsdokumentation aktiv anbieten (Ole, 18.11.2026): Zeitpunkt, an dem der Vermittler die Frage „Beratungsdokumentation
-- vorbereiten?“ beantwortet hat (Einrichtung, einmal nach dem ersten Termin-Ergebnis, oder der Schalter). Nur additiv.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "beratungsdokuGefragtAt" TIMESTAMP(3);
