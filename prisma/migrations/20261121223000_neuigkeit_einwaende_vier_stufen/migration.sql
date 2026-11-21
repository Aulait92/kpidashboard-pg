-- Neuigkeit (21.11.2026): Einwände in der Präsentation neu, mit Ablauf in vier Schritten (Hinweise) und sechs Folien. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_einwaende_vier_stufen', 'Einwände im Termin: Schritt für Schritt zum wahren Grund',
 'In der Präsentation im Termin führt Sie **Einwände** jetzt durch vier Schritte: prüfen, nachfragen, festhalten, lösen. Unter **Hinweise** stehen die passenden Sätze, nur für Sie. Neu sind die Folien „Erst vergleichen“ und „Noch unsicher“: Dort zeigt Ihr Kunde selbst, was ihn noch abhält.',
 'verbessert', 'software', '2026-11-21 22:30:00', '2026-11-21 22:30:00', '2026-11-21 22:30:00')
ON CONFLICT ("id") DO NOTHING;
