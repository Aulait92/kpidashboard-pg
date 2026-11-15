-- Neuigkeit: Termine vorbereiten (Aufgabe, Übersicht, Gesprächsleitfaden, PDF)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_termin_vorbereiten', 'Termine vorbereiten mit Übersicht und Gesprächsleitfaden',
 'Ab dem Vortag steht auf **Heute** die Aufgabe **Termine vorbereiten: Angebot rechnen**. Die Terminvorbereitung zeigt die Angaben Ihres Kunden in der Reihenfolge des Tarifrechners, die offenen Punkte für das Gespräch, einen Gesprächsleitfaden und die Unterlagen, auch **als PDF**. Mit **Vorbereitet** haken Sie die Aufgabe ab.',
 'neu', 'software', '2026-11-15 18:00:00', '2026-11-15 18:00:00', '2026-11-15 18:00:00')
ON CONFLICT ("id") DO NOTHING;
