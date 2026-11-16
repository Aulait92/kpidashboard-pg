-- Neuigkeit: Angebote mit Gesundheitsangaben werden nicht ausgelesen (Ole, 16.11.2026; lib/angebote.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_rechtliches', 'Angebote auslesen nur ohne Gesundheitsangaben',
 'In der **Terminvorbereitung** liest die App nur Sach-, Haftpflicht-, Rechtsschutz-, Unfall- und Tierangebote aus. Erkennt sie ein Angebot mit Gesundheitsangaben, etwa Zahnzusatz oder Berufsunfähigkeit, speichert sie nichts davon und Sie tragen es von Hand ein.',
 'verbessert', 'software', '2026-11-16 19:00:00', '2026-11-16 19:00:00', '2026-11-16 19:00:00')
ON CONFLICT ("id") DO NOTHING;
