-- Neuigkeit (17.11.2026): Rückruf mit Uhrzeit im Kalender, Link der Buchungsseite änderbar, Angebot in drei Schritten
-- ohne Angebots-Upload. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_rueckruf_kalender', 'Rückrufe im Kalender, eigener Buchungslink, Angebot in drei Schritten',
 'Bei **Später anrufen** können Sie jetzt eine Uhrzeit wählen: Der Rückruf steht dann auch in Ihrem Kalender. Den Link Ihrer Buchungsseite passen Sie unter **Einstellungen → Mein Kalender** über „Ändern“ an, der bisherige Link leitet weiter. In der Terminvorbereitung führen drei Schritte zum fertigen Angebot: Versicherungen wählen, Beiträge aus Ihrem Tarifrechner eintragen, Präsentation öffnen.',
 'neu', 'software', '2026-11-17 19:30:00', '2026-11-17 19:30:00', '2026-11-17 19:30:00')
ON CONFLICT ("id") DO NOTHING;
