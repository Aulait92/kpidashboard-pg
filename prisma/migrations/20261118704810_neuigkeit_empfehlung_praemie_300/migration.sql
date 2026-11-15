-- Neuigkeit: Kollegen empfehlen, 300 € Gutschrift je Kollege, der Kunde wird (Ole, 15.11.2026)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "pushedAt", "createdAt", "updatedAt") VALUES
('upd_2611_kollegen_300', 'Kollegen empfehlen: 300 € je Kollege',
 'Wird ein Kollege, den Sie empfohlen haben, Kunde, schreiben wir Ihnen 300 € netto auf Ihre nächste Rechnung gut. Jede weitere Empfehlung zählt wieder: 3 Kollegen sind 900 €. Ihren persönlichen Link finden Sie unter **Profil → Kollegen empfehlen**.',
 'verbessert', 'alle', '2026-11-15 22:30:00', NULL, '2026-11-15 22:30:00', '2026-11-15 22:30:00')
ON CONFLICT ("id") DO NOTHING;
