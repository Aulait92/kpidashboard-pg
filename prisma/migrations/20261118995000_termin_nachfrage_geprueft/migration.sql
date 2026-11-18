-- Termine Stufe 2 (Ole, 18.11.2026): Nachfrage „Wie lief der Termin?“ 15 Minuten nach Terminende nur einmal je Termin
-- (Push gesendet oder Ergebnis schon eingetragen). Nur additiv.
ALTER TABLE "SalesMeeting" ADD COLUMN IF NOT EXISTS "reviewCheckedAt" TIMESTAMP(3);
