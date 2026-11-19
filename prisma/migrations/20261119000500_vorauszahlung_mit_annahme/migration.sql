-- Vorauszahlung mit Annahme fällig (Ole, 19.11.2026): Bei Annahme mit Vorauszahlung (jährlich bzw. 6 Monate im Voraus)
-- gehen Setup und die Vorauszahlung des ersten Zeitraums sofort auf eine Rechnung; die Laufzeit beginnt weiter mit dem
-- Start. Das Feld unterscheidet neue Annahmen von bestehenden Verträgen (Vorauszahlung zum Start, unverändert).
-- Additiv, bestehende Zeilen bleiben false.
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "prepayAtAcceptance" BOOLEAN NOT NULL DEFAULT false;
