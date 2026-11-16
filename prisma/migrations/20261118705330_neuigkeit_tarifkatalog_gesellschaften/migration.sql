-- Neuigkeit: Tarifkatalog mit weiteren Gesellschaften (16.11.2026): Tierversicherer sowie ERGO, R+V, HUK-COBURG,
-- DEVK, Generali, Zurich, BarmeniaGothaer, VHV, Die Haftpflichtkasse, LVM, Provinzial, ARAG, ROLAND, ADVOCARD.
-- Nicht gegengeprüfte Werte zeigen „bitte prüfen“ (data/tarifkatalog/README.md, ungeprueft). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_tarifkatalog_gesellschaften', 'Tarifkatalog mit 21 Gesellschaften',
 'Im Tarifkatalog der Terminvorbereitung stehen jetzt Tarife von 21 Gesellschaften, darunter ERGO, R+V, HUK-COBURG, DEVK, Generali, Zurich, BarmeniaGothaer und Tierversicherer wie AGILA, HanseMerkur und Uelzener. Steht an einem Tarif „bitte prüfen“, gleichen Sie die Angaben vor dem Termin kurz mit den Unterlagen der Gesellschaft ab. Zu finden unter **Kontakt → Termin → Vorbereiten → Tarife ändern**.',
 'verbessert', 'software', '2026-11-16 13:30:00', '2026-11-16 13:30:00', '2026-11-16 13:30:00')
ON CONFLICT ("id") DO NOTHING;
