-- Neuigkeit: Meine Provisionen, eigene Produkte direkt anlegen; PKV als Tarifoptimierung für Makler
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_eigene_produkte_anlegen', 'Eigene Produkte direkt unter Meine Provisionen anlegen',
 'Unter **Meine Provisionen → Ihre eigenen Produkte → Produkt hinzufügen** legen Sie weitere Produkte, die Sie verkaufen, mit Ihren Sätzen für Abschluss und Bestand an. Sie stehen danach beim Abschluss zur Auswahl. Makler finden die PKV dort als Tarifoptimierung nach § 204 VVG.',
 'verbessert', 'software', '2026-11-15 10:20:00', '2026-11-15 10:20:00', '2026-11-15 10:20:00')
ON CONFLICT ("id") DO NOTHING;
