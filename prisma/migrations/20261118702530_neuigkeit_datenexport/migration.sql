-- Neuigkeit: Datenexport im Konto, Bestätigung vor dem ersten Import und eigene Sparten für Vertreter (15.11.2026)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "pushedAt", "createdAt", "updatedAt") VALUES
('upd_2611_datenexport', 'Ihre Daten als Download',
 'Unter **Konto & Rechnungen → Ihre Daten herunterladen** bekommen Sie alle Leads, Abschlüsse, Termine, Chats und Bestandskunden mit Einwilligungen als ZIP mit Excel-Dateien. Vertreter legen unter **Bestand → Einwilligungen & Versand → Meine Sparten** fest, für welche Sparten die App Kampagnen vorschlägt.',
 'neu', 'software', '2026-11-15 15:00:00', NULL, '2026-11-15 15:00:00', '2026-11-15 15:00:00')
ON CONFLICT ("id") DO NOTHING;
