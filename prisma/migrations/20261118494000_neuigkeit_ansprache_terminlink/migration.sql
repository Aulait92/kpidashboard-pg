-- Neuigkeit: Ansprache Sie/Du, Terminlink in E-Mails mit Erinnerung
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_ansprache_terminlink', 'Sie oder Du für Ihre Leads und ein Terminlink in E-Mails',
 'Unter **Einstellungen → WhatsApp-Vorlagen** wählen Sie, ob Ihre Leads gesiezt oder geduzt werden. Das gilt für den WhatsApp-Assistenten, Termin-Nachrichten, die Buchungsseite und Ihre E-Mail-Vorlagen. Standard ist „Sie“.

In den E-Mail-Vorlagen „Nicht erreicht“ und „Nachfassen Angebot“ steht jetzt ein persönlicher Link, mit dem sich der Kontakt direkt einen Termin bei Ihnen aussucht. Auf Wunsch erinnert Sie die App, falls kein Termin gebucht wird.',
 'neu', 'software', '2026-11-14 11:40:00', '2026-11-14 11:40:00', '2026-11-14 11:40:00')
ON CONFLICT ("id") DO NOTHING;
