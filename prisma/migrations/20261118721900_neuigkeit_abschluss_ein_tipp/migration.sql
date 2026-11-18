-- Neuigkeit (17.11.2026): Abschluss mit einem Tipp, Abschluss-Frage am Vorabend, Glückwunsch per WhatsApp. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_abschluss_ein_tipp', 'Abschluss mit einem Tipp',
 'Tippen Sie auf **Abschluss**: Die App trägt Sparte und Beitrag aus Ihrem Angebot ein (ohne Angebot einen typischen Beitrag), Sie bestätigen mit **Stimmt** und können Ihrem Kunden direkt per WhatsApp gratulieren. Am Abend vor dem nächsten Nachfassen fragt die App, ob Ihr Kunde schon abgeschlossen hat, und schreibt er es selbst im Chat, stoppt das Nachfassen und Sie bekommen Bescheid.',
 'neu', 'software', '2026-11-17 22:00:00', '2026-11-17 22:00:00', '2026-11-17 22:00:00')
ON CONFLICT ("id") DO NOTHING;
