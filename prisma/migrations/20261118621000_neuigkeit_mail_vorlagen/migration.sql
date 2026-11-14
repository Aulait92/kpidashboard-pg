-- Neuigkeit: neue E-Mail-Vorlagen, passend zur Phase des Kontakts
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_mail_vorlagen_phase', 'Acht neue E-Mail-Vorlagen, passend zur Phase',
 'Unter **Kontakt → E-Mail** finden Sie jetzt acht neue Vorlagen, etwa für die Terminvorbereitung, nach einem verpassten Termin, die Gesprächszusammenfassung (auf Wunsch als PDF unter Dokumente), fehlende Unterlagen, die Musterkündigung der alten Versicherung und die Willkommens-Mail zur Police. Oben stehen die Vorlagen, die zur Phase des Kontakts passen; Wiedervorlagen legt die App dabei auf Wunsch gleich mit an. Ändern können Sie alle Texte unter **Einstellungen → E-Mail-Postfach → Vorlagen**.',
 'neu', 'software', '2026-11-14 13:40:00', '2026-11-14 13:40:00', '2026-11-14 13:40:00')
ON CONFLICT ("id") DO NOTHING;
