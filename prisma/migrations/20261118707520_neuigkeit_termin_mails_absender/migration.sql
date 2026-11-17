-- Neuigkeit (17.11.2026): Termin-Mails an Leads aus dem eigenen Postfach bzw. mit „Name | Agentur“, Signatur aus den
-- Anbieterangaben mit Erstinformation, Erinnerung mit Uhrzeit im Betreff (Lead-Mail-Baustein, Paket P0). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_termin_mails_absender', 'Termin-Mails mit Ihrem Namen und Ihrer Signatur',
 'Bestätigung, Erinnerung und Absage eines Termins gehen aus Ihrem eigenen Postfach raus, wenn Sie es unter **Einstellungen → E-Mail-Postfach** verbunden haben. Sonst steht als Absender Ihr Name mit Agentur, Antworten landen direkt bei Ihnen, und jede Mail endet mit Ihrer Signatur samt Link zu Ihrer Erstinformation. Die Erinnerung am Vortag nennt im Betreff gleich Uhrzeit und Sie persönlich.',
 'verbessert', 'software', '2026-11-17 17:45:00', '2026-11-17 17:45:00', '2026-11-17 17:45:00')
ON CONFLICT ("id") DO NOTHING;
