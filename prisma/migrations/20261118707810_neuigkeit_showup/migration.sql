-- Neuigkeiten (17.11.2026): Show-up-Paket (Erinnerungen, „Ist … da?“ zum Terminbeginn, neue Zeiten nach verpasstem
-- Termin, Komplettcheck 45 Minuten) und Anruf-Erinnerung bei neuen Leads ohne Antwort. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_showup_termine', 'Videotermine: Erinnerungen und eine Frage zum Start',
 'Ihre Leads werden vor dem Termin per WhatsApp erinnert: am Vortag mit dem Nutzen des Gesprächs, eine Stunde vorher und kurz vor Beginn mit dem Link zum Videoraum. Zum Start fragt die App Sie per Push und auf **Heute**, ob Ihr Kontakt da ist; mit **Fehlt noch** bekommt er sofort den Link per WhatsApp, und wer nicht kommt, bekommt automatisch zwei neue Zeiten angeboten. Wünscht ein Lead den Komplettcheck, verlängert die App den Termin auf 45 Minuten, wenn Ihr Kalender es zulässt.',
 'neu', 'software', '2026-11-17 18:00:00', '2026-11-17 18:00:00', '2026-11-17 18:00:00'),
('upd_2611_anruf_ohne_antwort', 'Neue Leads ohne Antwort: Erinnerung zum Anrufen',
 'Antwortet ein neuer Lead 30 Minuten nach der ersten WhatsApp nicht, steht er auf **Heute** in Ihrer Anrufliste und Sie bekommen einen Push, mit dem Sie direkt anrufen; außerhalb Ihrer Termin-Zeiten erst zu Arbeitsbeginn. Danach gilt Ihr gewohnter Anrufplan mit bis zu 6 Versuchen, und schreibt der Lead im Chat zurück, endet er von selbst.',
 'neu', 'software', '2026-11-17 18:00:00', '2026-11-17 18:00:00', '2026-11-17 18:00:00')
ON CONFLICT ("id") DO NOTHING;
