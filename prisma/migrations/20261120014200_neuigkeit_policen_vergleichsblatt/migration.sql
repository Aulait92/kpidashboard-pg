-- Neuigkeit (20.11.2026): Policen auslesen überarbeitet, Spickzettel oben in der Terminvorbereitung, Vertragsseite mit
-- einer Hauptaktion, Fristen mit Resttagen. Fasst die Pakete 1 bis 4 und die SUS-Prüfung zusammen. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_policen_vergleichsblatt', 'Verträge Ihres Kunden auf einen Blick',
 'Hat Ihr Kunde Policen geschickt, sehen Sie oben in der **Terminvorbereitung** seine Beiträge im Monat und Jahr, Kündigungsfristen mit den verbleibenden Tagen und bis zu drei passende Fragen für den Termin. Mit einem Tipp öffnen Sie die Verträge und vergleichen die Angaben mit dem Original.',
 'verbessert', 'software', '2026-11-20 01:42:00', '2026-11-20 01:42:00', '2026-11-20 01:42:00')
ON CONFLICT ("id") DO NOTHING;
