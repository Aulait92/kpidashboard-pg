-- Neuigkeit (21.11.2026): Team-Überblick für Inhaber. Je Mitglied die Termine der nächsten 7 Tage und was offen ist,
-- Hinweis auf Heute, wenn bei jemandem etwas liegen bleibt. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_team_ueberblick', 'Team: Termine und offene Aufgaben je Mitglied',
 'Unter **Einstellungen → Team** sehen Sie je Mitglied die Termine der nächsten 7 Tage und was noch offen ist: Leads, die auf einen Anruf warten, überfällige Wiedervorlagen und Termine ohne Ergebnis. Bleibt bei jemandem etwas liegen, steht ein kurzer Hinweis auf **Heute**.',
 'neu', 'software', '2026-11-21 15:00:00', '2026-11-21 15:00:00', '2026-11-21 15:00:00')
ON CONFLICT ("id") DO NOTHING;
