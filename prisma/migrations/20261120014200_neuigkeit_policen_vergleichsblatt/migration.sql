-- Neuigkeit (20.11.2026): Policen auslesen überarbeitet, Spickzettel oben in der Terminvorbereitung, Vertragsseite mit
-- einer Hauptaktion, Fristen mit Resttagen, Push „Unterlagen sind da“, Policen je Berater. Fasst den Tag zusammen. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_policen_vergleichsblatt', 'Verträge Ihres Kunden auf einen Blick',
 'Schickt Ihr Kunde Policen, bekommen Sie sofort eine Benachrichtigung und sehen oben in der **Terminvorbereitung** seine Beiträge, Kündigungsfristen mit den verbleibenden Tagen und bis zu drei passende Fragen für den Termin. Mit einem Tipp öffnen Sie die Verträge und vergleichen die Angaben mit dem Original. Im Team sieht der Inhaber unter **Wachstum → Team im Zeitraum**, bei wie vielen Terminen je Berater Policen kamen und vorher geprüft wurden.',
 'verbessert', 'software', '2026-11-20 01:42:00', '2026-11-20 01:42:00', '2026-11-20 01:42:00')
ON CONFLICT ("id") DO NOTHING;
