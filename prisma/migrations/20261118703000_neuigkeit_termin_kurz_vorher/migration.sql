-- Neuigkeit: kurz vor dem Termin nachfragen, Angaben nach früher Buchung weiter abfragen, Nachfassen nach 8 Std.
UPDATE "ProductUpdate" SET "body" = 'Antwortet ein Lead Ihrem Assistenten nicht, fragt er nach 2 und nach 8 Stunden freundlich nach, am nächsten Tag noch einmal und nach 3 Tagen ein letztes Mal, auf Wunsch mit Link zu Ihrer Buchungsseite. Schreiben Sie selbst im Chat, hört er auf. Außerdem bestätigt er Termine verbindlicher: Der Lead speichert sich den Termin und meldet sich, wenn etwas dazwischenkommt. Mehr unter **Hilfe → Automatisches Nachfassen**.', "updatedAt" = NOW()
WHERE "id" = 'upd_2611_chat_ruht';
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_termin_kurz_vorher', 'Kurz vor dem Termin: passt alles?',
 'Etwa eine Stunde vor dem Termin fragt Ihr Assistent den Lead per WhatsApp, ob alles passt. Ist etwas dazwischengekommen, wird verschoben statt verpasst. Bucht ein Lead schon früh einen Termin, fragt der Assistent die noch fehlenden Angaben für Ihr Angebot nach der Buchung weiter ab.',
 'neu', 'software', '2026-11-15 14:00:00', '2026-11-15 14:00:00', '2026-11-15 14:00:00')
ON CONFLICT ("id") DO NOTHING;
