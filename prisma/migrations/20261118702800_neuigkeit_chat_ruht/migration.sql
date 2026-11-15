-- Neuigkeit: Assistent fasst nach, wenn der Lead im Chat nicht antwortet; Termine verbindlicher bestätigt
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_chat_ruht', 'Assistent fasst nach, wenn ein Lead nicht antwortet',
 'Antwortet ein Lead Ihrem Assistenten nicht, fragt er nach 2 Stunden freundlich nach, am nächsten Tag noch einmal und nach 3 Tagen ein letztes Mal, auf Wunsch mit Link zu Ihrer Buchungsseite. Schreiben Sie selbst im Chat, hört er auf. Außerdem bestätigt er Termine verbindlicher: Der Lead speichert sich den Termin und meldet sich, wenn etwas dazwischenkommt. Mehr unter **Hilfe → Automatisches Nachfassen**.',
 'neu', 'software', '2026-11-15 13:00:00', '2026-11-15 13:00:00', '2026-11-15 13:00:00')
ON CONFLICT ("id") DO NOTHING;
