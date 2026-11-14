-- „3 aktive Verkäufer inklusive“ (Ole, 14.11.2026): Zeitpunkt der letzten Lead-Zuweisung je Login.
-- Wer am Abrechnungstag Leads zugewiesen bekam, zählt für diesen Tag als aktiver Verkäufer.
-- Nur hinzufügend.
ALTER TABLE "User" ADD COLUMN "leadReceivedAt" TIMESTAMP(3);
