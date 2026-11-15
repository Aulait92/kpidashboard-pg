-- Neuigkeit: Nachfrage nach dem Abschluss nur mit Einverständnis, neutrale Bewertungsbitte (15.11.2026)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "pushedAt", "createdAt", "updatedAt") VALUES
('upd_2611_bewertungsbitte', 'Bewertungsbitte nur mit Einverständnis',
 'Die Nachfrage nach dem Abschluss mit Bitte um eine Google-Bewertung und später um eine Empfehlung geht jetzt nur an Kunden, die einverstanden sind. Fragen Sie im Gespräch und bestätigen Sie es im Kontakt unter **Empfehlungen & Bewertungen → Kunde ist einverstanden**. Die Nachricht bittet neutral um eine ehrliche Bewertung, einmal je Kunde, und wer STOPP antwortet, bekommt keine weitere Bitte.',
 'verbessert', 'software', '2026-11-15 15:00:00', NULL, '2026-11-15 15:00:00', '2026-11-15 15:00:00')
ON CONFLICT ("id") DO NOTHING;
