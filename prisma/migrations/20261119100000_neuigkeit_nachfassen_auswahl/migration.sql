-- Neuigkeit (19.11.2026): beim Nachfassen im Chat Vorlage wählen, passende ist empfohlen. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_nachfassen_auswahl', 'Nachfassen: passende Vorlage wählen',
 'Antwortet ein Kontakt nicht mehr, wählen Sie beim Nachfassen jetzt selbst die Vorlage, zum Beispiel nach einem verpassten Termin oder zu einem Angebot. Die App markiert die passende als „Empfohlen“ (**Nachrichten → Chat → Nachfassen senden**).',
 'verbessert', 'software', '2026-11-19 10:00:00', '2026-11-19 10:00:00', '2026-11-19 10:00:00')
ON CONFLICT ("id") DO NOTHING;
