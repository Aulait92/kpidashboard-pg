-- Neuigkeit: neue Terminvorbereitung mit Tarifkatalog. Bleibt für Kunden ausgeblendet, bis die Seite für alle an ist
-- (lib/terminvorbereitung-neu.ts TERMINVORBEREITUNG_NEU_FUER_ALLE, Filter in lib/neuigkeiten.ts; kein Push).
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_terminvorbereitung_katalog', 'Terminvorbereitung mit Tarifkatalog',
 'Die Terminvorbereitung ist neu aufgebaut: Passende Tarife und Merkmale sind schon ausgewählt, Sie tragen nur noch die Beiträge ein oder legen das Angebot als PDF ab und sehen sofort, wie die Vergleichsfolie aussieht. Oben steht, was der Kunde will und was im Termin noch zu klären ist. Zu finden unter **Kontakt → Termin → Vorbereiten**.',
 'neu', 'software', '2026-11-15 23:40:00', '2026-11-15 23:40:00', '2026-11-15 23:40:00')
ON CONFLICT ("id") DO NOTHING;
