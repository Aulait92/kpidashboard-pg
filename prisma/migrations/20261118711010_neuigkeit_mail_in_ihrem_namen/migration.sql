-- Neuigkeit (17.11.2026): E-Mail an Leads auch ohne verbundenes Postfach, drei Wege im Fenster „E-Mail schreiben“
-- (über die App, eigenes Mailprogramm, Text kopieren) und Einstellungen → Assistent (Kopie, Stufe je Mail). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_mails_in_ihrem_namen', 'E-Mails an Leads auch ohne verbundenes Postfach',
 'Unter **E-Mail** im Kontakt senden Sie jetzt auch ohne verbundenes Postfach: mit Ihrem Namen und Ihrer Agentur als Absender, Ihrer Signatur und Antworten direkt an Sie. Alternativ öffnen Sie den Text mit einem Tipp im eigenen Mailprogramm oder kopieren ihn, danach trägt die App die Mail auf Wunsch im Verlauf ein. Unter **Einstellungen → Assistent** legen Sie fest, ob Sie eine Kopie jeder Mail bekommen und wie die App mit jeder E-Mail-Vorlage umgeht.',
 'neu', 'software', '2026-11-17 20:00:00', '2026-11-17 20:00:00', '2026-11-17 20:00:00')
ON CONFLICT ("id") DO NOTHING;
