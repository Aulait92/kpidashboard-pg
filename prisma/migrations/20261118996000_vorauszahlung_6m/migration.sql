-- Laufzeit 6 Monate mit Vorauszahlung (Ole, 18.11.2026): Erinnerung 30 Tage vor Ende eines Vorauszahlungszeitraums
-- (6 oder 12 Monate) genau einmal je Zeitraum. Customer.billingInterval bekommt zusätzlich den Wert "halfyear" (Text, ohne Änderung).
ALTER TABLE "Customer" ADD COLUMN "prepayReminderFor" TIMESTAMP(3);
