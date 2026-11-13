-- Neuigkeit: einfachere Einrichtung (einheitliche Schritte, kürzerer Fragebogen, KI-Hilfe)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_einrichtung', 'Einrichtung jetzt übersichtlicher',
 'Unter **Einrichtung** sehen Sie jetzt alle Ihre Schritte in einer Liste, genau wie auf der Startseite. Der Fragebogen ist kürzer, und bei Fragen hilft Ihnen die **KI-Hilfe** sofort weiter.',
 'verbessert', 'alle', '2026-11-13 20:58:00', '2026-11-13 20:58:00', '2026-11-13 20:58:00')
ON CONFLICT ("id") DO NOTHING;
