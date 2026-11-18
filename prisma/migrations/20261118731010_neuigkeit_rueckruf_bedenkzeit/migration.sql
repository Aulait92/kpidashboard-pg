-- Neuigkeit (17.11.2026): Rückruf mit Zeitfenster und Bedenkzeit zum Angebot (Paket P5). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_rueckruf_bedenkzeit', 'Rückruf mit Zeitfenster und Bedenkzeit zum Angebot',
 'Tippt Ihr Kunde in der Nachfass-Mail auf **Rückruf wünschen**, wählt er ein Zeitfenster aus Ihren Geschäftszeiten und kann kurz notieren, worum es geht; Sie bekommen einen Push und die Aufgabe mit Zeitfenster auf **Heute**, das Nachfassen wartet so lange. Möchte Ihr Kunde noch überlegen, fragt der Assistent, wann er sich wieder melden darf, und fasst erst dann wieder nach; selbst eintragen können Sie die Bedenkzeit am Kontakt unter **Automatisches Nachfassen → Pausieren**.',
 'neu', 'software', '2026-11-17 23:10:00', '2026-11-17 23:10:00', '2026-11-17 23:10:00')
ON CONFLICT ("id") DO NOTHING;
