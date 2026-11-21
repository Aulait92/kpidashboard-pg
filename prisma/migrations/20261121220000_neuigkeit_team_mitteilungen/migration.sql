-- Neuigkeit (21.11.2026): Teamliste zeigt „Mitteilungen aus“ je Berater; App-Store-App zählt als Mitteilungen an. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_team_mitteilungen', 'Team: sehen, wer Mitteilungen aus hat',
 'Unter **Einstellungen → Team** steht jetzt bei jedem Berater „Mitteilungen aus“, solange auf keinem seiner Geräte Mitteilungen erlaubt sind. So erfährt niemand zu spät von einem neuen Lead.',
 'neu', 'software', '2026-11-21 22:00:00', '2026-11-21 22:00:00', '2026-11-21 22:00:00')
ON CONFLICT ("id") DO NOTHING;
