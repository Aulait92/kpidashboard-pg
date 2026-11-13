-- Neuigkeit: Terminzeiten je Wochentag, Budget eintippen
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_terminzeiten', 'Terminzeiten für jeden Wochentag einzeln',
 'Unter **Einstellungen → Mein Kalender** legen Sie jetzt für jeden Tag eigene Zeiten fest, z. B. montags nur vormittags. Ihr Tagesbudget unter **Konto → Werbebudget** können Sie außerdem direkt eintippen.',
 'neu', 'software', '2026-11-13 21:15:00', '2026-11-13 21:15:00', '2026-11-13 21:15:00')
ON CONFLICT ("id") DO NOTHING;
