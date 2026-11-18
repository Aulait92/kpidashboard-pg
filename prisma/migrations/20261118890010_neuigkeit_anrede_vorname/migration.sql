-- Neuigkeit (18.11.2026): Anrede aus eindeutigem Vornamen (Ole). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_anrede_vorname', 'Persönlichere Anrede in Nachrichten an Leads',
 'Ist der Vorname eindeutig, beginnen Nachrichten an Ihre Leads jetzt mit „Guten Tag Frau Schneider“ statt mit dem vollen Namen. Bei Vornamen wie Andrea oder Kim bleibt es beim vollen Namen. Die Anrede sehen und ändern Sie jederzeit im Kontakt unter **Angaben bearbeiten**.',
 'verbessert', 'alle', '2026-11-18 08:56:00', '2026-11-18 08:56:00', '2026-11-18 08:56:00')
ON CONFLICT ("id") DO NOTHING;
