-- Neuigkeit: Notizen & Verlauf am Lead, Abschluss mit Beitrag/Provision und Police
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_verlauf_police', 'Notizen & Verlauf, Police nach dem Abschluss',
 'Beim Lead schreiben Sie Notizen jetzt unter **Notizen & Verlauf** und tippen auf **Speichern**: Sie stehen dort mit Datum, zusammen mit Anrufen, Wiedervorlagen und Abschluss. Nach einem Abschluss sehen Sie oben Beitrag und geschätzte Provision, und auf **Heute** erscheint **Police fertig machen**, bis Sie es abhaken.',
 'neu', 'alle', '2026-11-13 21:44:00', '2026-11-13 21:44:00', '2026-11-13 21:44:00')
ON CONFLICT ("id") DO NOTHING;
