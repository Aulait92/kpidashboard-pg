-- Neuigkeit: Tarif im Termin wählen, Vergleichstabelle, Link für den Kunden
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_tarifwahl_kundenlink', 'Tarif im Termin wählen und Link für Ihren Kunden',
 'Mehrere Stufen einer Sparte zeigt die **Präsentation** jetzt als Vergleichstabelle wie im Tarifrechner. Mit **Auswählen** wechseln Sie im Termin die Stufe, Beitrag und Leistungen passen sich sofort an. Danach erstellen Sie unter der Präsentation einen **Link für Ihren Kunden**: Er zeigt den Stand aus dem Termin zum Nachlesen und ist 14 Tage gültig.',
 'neu', 'software', '2026-11-15 20:10:00', '2026-11-15 20:10:00', '2026-11-15 20:10:00')
ON CONFLICT ("id") DO NOTHING;
