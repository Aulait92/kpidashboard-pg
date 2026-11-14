-- Neuigkeit: Zahlungsart hinterlegen in Konto & Rechnungen, Lastschrift vorausgewählt
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_lastschrift', 'Zahlungsart selbst hinterlegen',
 'Unter **Konto & Rechnungen → Zahlung und Rechnungsdaten** können Sie Ihre Zahlungsart jetzt direkt hinterlegen oder wechseln: per Lastschrift oder mit Karte, Apple Pay bzw. Google Pay. Am einfachsten geht es per Lastschrift, der Betrag wird dann monatlich automatisch eingezogen.',
 'verbessert', 'alle', '2026-11-14 13:45:00', '2026-11-14 13:45:00', '2026-11-14 13:45:00')
ON CONFLICT ("id") DO NOTHING;
