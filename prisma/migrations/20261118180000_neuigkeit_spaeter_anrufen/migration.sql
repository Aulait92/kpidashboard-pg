-- Neuigkeit: Später anrufen an einem eigenen Tag; Bestandsprovision für Vertreter vorausgefüllt
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_spaeter_anrufen', 'Später anrufen: Tag frei wählen',
 'Unter **Später** können Sie jetzt auch einen eigenen Tag wählen (**Anderer Tag …**), z. B. wenn ein Lead nach dem Urlaub angerufen werden möchte. Unter **Meine Provisionen** ist für Vertreter außerdem eine Bestandsprovision von 10 % ab dem 2. Jahr vorausgefüllt.',
 'verbessert', 'alle', '2026-11-13 21:26:00', '2026-11-13 21:26:00', '2026-11-13 21:26:00')
ON CONFLICT ("id") DO NOTHING;
