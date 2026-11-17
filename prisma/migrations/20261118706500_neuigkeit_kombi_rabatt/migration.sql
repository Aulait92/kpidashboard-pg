-- Neuigkeit: Kombi-Rabatt und „Ihr Schutz im Überblick“ in Terminvorbereitung und Präsentation (17.11.2026). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_kombi_rabatt', 'Kombi-Rabatt und weitere Versicherungen im Termin',
 'Wählen Sie mehrere passende Sparten einer Gesellschaft, rechnet die **Terminvorbereitung** den Kombi-Rabatt mit und zeigt, was bis zur nächsten Stufe fehlt. In der **Präsentation** sieht Ihr Kunde auf „Ihr Schutz im Überblick“, was er schon hat und was fehlt; mit „Mit anschauen“ kommt eine Sparte dazu und der Beitrag rechnet sich sofort neu.',
 'neu', 'software', '2026-11-17 00:50:00', '2026-11-17 00:50:00', '2026-11-17 00:50:00')
ON CONFLICT ("id") DO NOTHING;
