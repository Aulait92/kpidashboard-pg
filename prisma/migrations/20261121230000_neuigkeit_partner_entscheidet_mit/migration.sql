-- Neuigkeit (21.11.2026): Der Assistent fragt nach der Buchung, ob noch jemand mitentscheidet; bei Ja kommen beide zum Termin. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_partner_entscheidet_mit', 'Entscheidet der Partner mit? Dann ist er beim Termin dabei',
 'Ihr Assistent fragt nach der Buchung kurz, ob noch jemand mitentscheidet, zum Beispiel der Partner. Wenn ja, bittet er darum, dass beide zum Termin kommen, damit im Termin eine Entscheidung fallen kann. Sie sehen es vorab in der **Terminvorbereitung** unter „Das will der Kunde“.',
 'neu', 'software', '2026-11-21 23:00:00', '2026-11-21 23:00:00', '2026-11-21 23:00:00')
ON CONFLICT ("id") DO NOTHING;
