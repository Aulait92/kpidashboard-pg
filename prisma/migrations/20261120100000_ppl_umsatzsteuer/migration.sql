-- Umsatzsteuer beim Leadverkauf (Ole, 20.11.2026; docs/recht/ust-leadverkauf-2026-11-19.md).
-- Nur neue, leere Spalten: keine bestehenden Daten werden geändert. Ohne Registerprüfung bleiben alle Leads
-- steuerpflichtig (19 %), wie bisher.

-- Registerprüfung am Kunden (vor der ersten Lieferung)
ALTER TABLE "Customer" ADD COLUMN "vermittlerRegisterNr" TEXT;
ALTER TABLE "Customer" ADD COLUMN "vermittlerRegisterStatus" TEXT;
ALTER TABLE "Customer" ADD COLUMN "vermittlerGeprueftAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "vermittlerGeprueftVon" TEXT;

-- Steuerkennzeichen je Bezug (null = Standard je Produkt)
ALTER TABLE "LeadSubscription" ADD COLUMN "steuer" TEXT;

-- Angewandte Steuer je Bestellung (für die Voranmeldung: steuerfreie Umsätze)
ALTER TABLE "LeadOrder" ADD COLUMN "steuer" TEXT;
