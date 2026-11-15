-- Neuigkeit: Einrichtung mit E-Mail-Postfach, „Meine Gesellschaft erlaubt das nicht“
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_einrichtung_postfach', 'Einrichtung: E-Mail-Postfach und Schritte, die Ihre Gesellschaft nicht erlaubt',
 'In der **Einrichtung** verbinden Sie jetzt auch Ihr E-Mail-Postfach. Erlaubt Ihre Gesellschaft das nicht, tippen Sie **Meine Gesellschaft erlaubt das nicht**: Die App blendet dann alle E-Mail-Funktionen aus, wieder einschaltbar unter **Einstellungen → E-Mail-Postfach**. Kalender und WhatsApp lassen sich mit Grund überspringen.',
 'neu', 'software', '2026-11-15 09:00:00', '2026-11-15 09:00:00', '2026-11-15 09:00:00')
ON CONFLICT ("id") DO NOTHING;
