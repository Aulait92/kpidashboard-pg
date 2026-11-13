-- Neuigkeit: „Heute“ für alle als Startseite, Zahlen im Menü, aufgeräumtes Profilmenü mit „Einstellungen“
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_menue', 'Aufgeräumtes Menü und „Heute“ als Startseite',
 'Ihre Startseite ist jetzt **Heute**: Termine, Rückrufe und fällige Aufgaben auf einen Blick. Ihre Zahlen finden Sie unten unter **Zahlen**. Alle Einstellungen wie Konto, Team, Kalender und Provisionen sind übersichtlich gebündelt unter **Profil → Einstellungen**.',
 'verbessert', 'alle', '2026-11-13 17:36:00', '2026-11-13 17:36:00', '2026-11-13 17:36:00')
ON CONFLICT ("id") DO NOTHING;
