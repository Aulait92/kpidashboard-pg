-- Neuigkeit (25.11.2026, Usability-Check): Wochenzusammenfassung kleiner Verbesserungen (Lesbarkeit, Neuigkeiten je Woche,
-- kürzerer WhatsApp-Schritt, ein Weg ohne Google oder Outlook). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2511_lesbarer_uebersichtlicher', 'Lesbarer und übersichtlicher',
 'Kleine Schriften in Listen, Knöpfen und der unteren Leiste sind größer, und auf jedem Bildschirm gibt es nur noch einen blauen Hauptknopf. **Neuigkeiten** zeigen je Woche das Wichtigste, der Rest ist aufklappbar.

In der **Einrichtung** ist der Schritt **WhatsApp verbinden** deutlich kürzer, und ohne Google- oder Outlook-Kalender führt eine Frage zum passenden Weg.',
 'verbessert', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
