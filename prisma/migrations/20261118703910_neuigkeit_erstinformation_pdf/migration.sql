-- Neuigkeit: Erstinformation mit allen Pflichtangaben, als PDF per WhatsApp und an der Terminbestätigung (Ole, 15.11.2026)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_erstinfo_pdf', 'Erstinformation vollständig und als PDF',
 'Ihre Erstinformation enthält jetzt alle Angaben nach § 15 VersVermV (z. B. Versicherer, Vergütung, Beteiligungen, IHK) und geht als PDF an neue Leads, per WhatsApp und an der Terminbestätigung per E-Mail. Bitte prüfen und bestätigen Sie die vorausgefüllten Angaben einmal unter **Einrichtung → Erstinformation für Ihre Leads**; eine Vorlage Ihrer Gesellschaft können Sie dort auch als PDF hochladen.',
 'verbessert', 'software', '2026-11-15 18:00:00', '2026-11-15 18:00:00', '2026-11-15 18:00:00')
ON CONFLICT ("id") DO NOTHING;
