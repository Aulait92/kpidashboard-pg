-- Pay-per-Lead + Software, Variante „Kampagnen im eigenen Werbekonto“ (Ole, 20.11.2026;
-- docs/firma/protokolle/2026-11-20-ppl-im-kundenkonto.md). Nur neue, leere Spalten: bestehende Angebote bleiben
-- unverändert (null = bisheriges Modell, Leads aus unserem Pool).
ALTER TABLE "Offer" ADD COLUMN "pplModell" TEXT;
-- Produkte mit Preis je Lead (Endpreis brutto inkl. USt.) und Startmenge: [{ name, preis, menge }]
ALTER TABLE "Offer" ADD COLUMN "pplProdukte" JSONB;
