-- Neuigkeit: E-Mail-Signatur
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_mail_signatur', 'E-Mail: Signatur und Knopf direkt beim Kontakt',
 'Unter **Einstellungen → E-Mail-Postfach → Signatur** hinterlegen Sie einmal Ihre Signatur (Name, Agentur, Telefon). Sie steht danach automatisch unter jeder E-Mail, die Sie aus der App an Leads schreiben – mit und ohne Vorlage. Außerdem finden Sie **E-Mail** jetzt direkt beim Kontakt neben Anrufen und Chat.',
 'verbessert', 'software', '2026-11-14 00:00:00', '2026-11-14 00:00:00', '2026-11-14 00:00:00')
ON CONFLICT ("id") DO NOTHING;
