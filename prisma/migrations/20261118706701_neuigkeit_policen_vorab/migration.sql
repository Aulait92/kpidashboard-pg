-- Neuigkeit (17.11.2026): Leads schicken ihre Policen vor dem Termin per WhatsApp. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_policen_vorab', 'Policen schon vor dem Termin',
 'Ihr WhatsApp-Assistent lädt Leads mit bestehenden Verträgen ein, Fotos oder PDFs ihrer Policen vorab in den Chat zu schicken, damit Sie sich vor dem Termin einlesen können. Sie finden sie im Kontakt unter **Dokumente** und in der Terminvorbereitung, bei Sachversicherungen schon mit Gesellschaft, Beitrag und Ablauf. Ohne Abschluss werden die Unterlagen 30 Tage nach dem Termin automatisch gelöscht.',
 'neu', 'software', '2026-11-17 12:30:00', '2026-11-17 12:30:00', '2026-11-17 12:30:00')
ON CONFLICT ("id") DO NOTHING;
