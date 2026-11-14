-- Neuigkeit: Monatsberichte in der App mit PDF-Download
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_monatsberichte_pdf', 'Monatsberichte jederzeit in der App, auch als PDF',
 'Alle Monatsberichte finden Sie unter **Zahlen → Monatsberichte**, oben auf der Seite führt ein Link direkt dorthin. Jeden Bericht laden Sie mit **PDF** herunter, etwa zum Ablegen. In der Bericht-E-Mail bringt Sie **Alle Berichte ansehen** zur Übersicht.',
 'verbessert', 'alle', '2026-11-14 19:35:00', '2026-11-14 19:35:00', '2026-11-14 19:35:00')
ON CONFLICT ("id") DO NOTHING;
