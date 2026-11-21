-- Neuigkeit (21.11.2026): Berater im Team einer Allianz-Agentur bekommen ihre Termine als Einladung an die eigene
-- Allianz-Adresse, gebucht nur in den freien Zeiten ihrer Person im Allianz-Online-Kalender. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_berater_allianz', 'Team: Termine per Einladung an die eigene Allianz-Adresse',
 'Ihre Berater wählen unter **Mein Kalender** einmal aus, wer sie im Allianz-Online-Kalender Ihrer Agentur sind. Termine für ihre Leads gibt es dann nur in ihren freien Zeiten, und jeder Termin kommt als Einladung an ihre Allianz-Adresse. Als Inhaber stellen Sie das auch unter **Team** beim jeweiligen Mitglied ein.',
 'neu', 'software', '2026-11-21 14:00:00', '2026-11-21 14:00:00', '2026-11-21 14:00:00')
ON CONFLICT ("id") DO NOTHING;
