-- Neuigkeit (18.11.2026): Schutz im Überblick verständlicher und Termin-Mails mit Vorbereitung (M3). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_schutz_termin_mails', 'Schutz im Überblick einfacher, Termin-Mails mit Vorbereitung',
 'Unter **Termin vorbereiten → Schutz im Überblick** beantworten Sie je Versicherung nur noch „Hat Frau Becker das schon?“ mit „Ja, bei mir“, „Ja, woanders“, „Weiß nicht“ oder „Nein“; was Ihr Kunde schon im Chat genannt hat, ist vorbelegt, oben sehen Sie die Ampel wie in der Präsentation, und alles wird automatisch gespeichert. Die Terminbestätigung und die Erinnerung am Vortag per E-Mail sagen Ihrem Kunden jetzt, was er zum Termin bereitlegen soll, dieselbe Liste wie im WhatsApp-Chat. Abschalten können Sie das unter **Einstellungen → Assistent** bei „Termin: Vorbereitung“.',
 'verbessert', 'software', '2026-11-18 02:40:00', '2026-11-18 02:40:00', '2026-11-18 02:40:00')
ON CONFLICT ("id") DO NOTHING;
