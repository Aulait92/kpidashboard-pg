-- Neuigkeit (19.11.2026): Angebot in der Terminvorbereitung als eine Liste je Versicherung. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_angebot_einfach', 'Angebot für den Termin: eine Zeile je Versicherung',
 'In **Termin vorbereiten → Angebot für den Termin** steht jede Versicherung in einer eigenen Zeile mit Ihrer Empfehlung und dem Beitrag. Nötig ist nur der Beitrag Ihrer Empfehlung, mit **Weiter** kommen Sie zur nächsten Versicherung und sehen oben, wie viele Beiträge noch fehlen.',
 'verbessert', 'software', '2026-11-19 05:30:00', '2026-11-19 05:30:00', '2026-11-19 05:30:00')
ON CONFLICT ("id") DO NOTHING;
