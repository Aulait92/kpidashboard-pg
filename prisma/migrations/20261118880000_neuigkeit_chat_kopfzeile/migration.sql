-- Neuigkeit (18.11.2026): Chat am Handy mit mehr Platz (Kopfzeile kompakt, Details per Tipp auf den Namen). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_chat_kopfzeile', 'Mehr Platz im Chat am Handy',
 'Unter **Nachrichten** sehen Sie am Handy jetzt mehr vom Gespräch: Den nächsten Termin finden Sie direkt unter dem Namen, steht er in den nächsten 24 Stunden an, öffnet **Vorbereiten** oben die Terminvorbereitung. Termin, Angaben und Kontakt öffnen Sie mit einem Tipp auf den Namen.',
 'verbessert', 'software', '2026-11-18 08:36:00', '2026-11-18 08:36:00', '2026-11-18 08:36:00')
ON CONFLICT ("id") DO NOTHING;
