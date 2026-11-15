-- Neuigkeit: Login-E-Mail selbst ändern
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_email_aendern', 'Anmelde-Adresse selbst ändern',
 'Unter **Einstellungen → Anmeldung & Sicherheit** ändern Sie die E-Mail-Adresse für Ihre Anmeldung jetzt selbst. Zur Sicherheit bestätigen Sie die neue Adresse über einen Link, Ihr Passwort bleibt gleich.',
 'neu', 'alle', '2026-11-15 17:00:00', '2026-11-15 17:00:00', '2026-11-15 17:00:00')
ON CONFLICT ("id") DO NOTHING;
