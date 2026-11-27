-- Neuigkeit (27.11.2026, Nachfassen folgt dem Status: neue Phase ersetzt die alte Strecke, kein Versand an Sonn- und
-- Feiertagen, Ziel nach Status). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "pushedAt", "createdAt", "updatedAt") VALUES
('upd_2711_nachfassen_status', 'Nachfassen passt sich dem Stand an',
 'Setzen Sie einen Kontakt auf **Angebot gesendet**, fasst die App ab dann zum Angebot nach, statt weiter nach einem Termin zu fragen; bei Termin, Abschluss oder Verloren endet das bisherige Nachfassen samt Anrufplan. Automatische Nachrichten gehen nicht mehr an Sonn- und Feiertagen raus, sondern am nächsten Werktag; was geplant ist, sehen Sie im Kontakt unter **Nächste Nachrichten**.',
 'verbessert', 'software', '2026-11-27 21:00:00', NULL, now(), now())
ON CONFLICT ("id") DO NOTHING;
