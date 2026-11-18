-- Neuigkeit (18.11.2026): Maklervollmacht digital mit Übernahme bestehender Verträge (nur Makler). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_maklervollmacht', 'Für Makler: Maklervollmacht digital unterschreiben lassen',
 'Im Kontakt finden Sie die Karte **Maklervollmacht**: Ihr Kunde bekommt einen Link, trägt seine bestehenden Verträge ein und unterschreibt mit dem Finger, auch direkt im Termin. Danach laden Sie je Versicherer ein fertiges Schreiben zur Bestandsübertragung mit der Vollmacht herunter, und Ihr Kunde erhält automatisch eine Kopie.',
 'neu', 'software', '2026-11-18 06:00:00', '2026-11-18 06:00:00', '2026-11-18 06:00:00')
ON CONFLICT ("id") DO NOTHING;
