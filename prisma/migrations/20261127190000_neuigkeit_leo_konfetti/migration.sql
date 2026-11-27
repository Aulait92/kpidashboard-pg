-- Neuigkeit (27.11.2026, Maskottchen Leo und Konfetti beim Abschluss). Livegang 20:00 Uhr Berlin = 19:00 UTC. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2711_leo_konfetti', 'Leo ist da',
 'Leo begleitet Sie ab heute durch die App: bei der Einrichtung, in der **Hilfe** und wenn Sie einen Abschluss feiern. Tragen Sie einen Abschluss ein, gibt es kurz Konfetti.',
 'neu', 'alle', '2026-11-27 19:00:00', now(), now())
ON CONFLICT ("id") DO NOTHING;
